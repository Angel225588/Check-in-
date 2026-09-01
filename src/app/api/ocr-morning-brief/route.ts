import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { securityError } from "@/lib/security/errors";
import { getRoutePolicy, MAX_BRIEF_FILES } from "@/lib/security/config";
import {
  guardError,
  holdBudget,
  readValidatedFile,
  settleFailed,
  settleOk,
  type AiBudgetHold,
} from "@/lib/security/guard";
import { ocrCost, chatCost } from "@/lib/security/budget";
import { getAiProvider, hasMistralKey, AiError } from "@/lib/ai";


// Two-stage: OCR transcribes the briefing to markdown, then the chat model
// interprets it. The brief is prose + tables in French with real semantics to
// resolve ("EN ARRIVÉE" → arriving, "Du 19 au 03/05" → a date range), which is
// the one place in this app where a language model genuinely earns its keep.
const EXTRACTION_PROMPT = `You extract ONLY 3 sections from the Marriott Courtyard "Briefing du Matin" (French), transcribed below as markdown: the FORECAST table, anniversaire/honeymoon events (EVENEMENTS SPECIAUX), and CLIENT AMBASSADORS. Skip everything else.

CRITICAL ANTI-HALLUCINATION RULES — read carefully:
1. NEVER invent a name or room number. If a value is not present in the text, return "" / 0.
2. NEVER complete or "fix" a name that looks misspelled — copy what is printed EXACTLY (e.g. "HEYSCHELABORDE", not "REYSCHDELABORDE").
3. For the FORECAST table, each day column has these rows IN ORDER: # Sell limit, # Occupied, # Occupied minus COMP, TO %, # Arrivals, # Departure. Do NOT shuffle rows. "# Sell limit" is usually the SAME number (e.g. 339) for every column.
4. Ignore GSS, COMMENTAIRES CLIENTS, DUTY, GROUPES, FRONT OFFICE, PLAINTES, TOP VIPs, THEME DU JOUR, VALEURS and INTERNAL ANNIVERSARY entirely.

Field rules:
- "date" must be ISO YYYY-MM-DD parsed from the printed header (e.g. "JEUDI 30 AVRIL 2026" → "2026-04-30").
- "occupancyPercent" is a number (e.g. 46.02 not "46.02%").
- "occupiedComp" comes from the "# Occupied minus COMP" row, NOT the "# Occupied" row.
- For SPECIAL EVENTS: "Du 19 au 03/05" → arrivalDate "19/04 → 03/05" (infer month from context). Section header "IN HOUSE" → in_house, "EN ARRIVÉE" → arriving.
- Room numbers are printed with a "#" prefix (e.g. "#707"). Extract ONLY the 3 digits ("707").
- If the document is not a Marriott Briefing du Matin, return an empty date and empty arrays.`;

// Mirrors the previous Gemini JSON contract exactly so the UI is unchanged.
const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "forecast", "specialEvents", "ambassadors"],
  properties: {
    date: { type: "string", description: "ISO YYYY-MM-DD, or empty string" },
    forecast: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date", "sellLimit", "occupied", "occupiedComp",
          "occupancyPercent", "arrivals", "departures",
        ],
        properties: {
          date: { type: "string" },
          sellLimit: { type: "number" },
          occupied: { type: "number" },
          occupiedComp: { type: "number" },
          occupancyPercent: { type: "number" },
          arrivals: { type: "number" },
          departures: { type: "number" },
        },
      },
    },
    specialEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "guestName", "roomNumber", "reason", "status", "arrivalDate"],
        properties: {
          type: { type: "string", enum: ["anniversaire", "honeymoon", "anniversary-stay", "other"] },
          guestName: { type: "string" },
          roomNumber: { type: "string" },
          reason: { type: "string" },
          status: { type: "string", enum: ["in_house", "arriving"] },
          arrivalDate: { type: "string" },
        },
      },
    },
    ambassadors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["guestName", "roomNumber", "status", "notes"],
        properties: {
          guestName: { type: "string" },
          roomNumber: { type: "string" },
          status: { type: "string", enum: ["in_house", "arriving"] },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

function normalizeBrief(parsed: Record<string, unknown>): Record<string, unknown> {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const todayIso = new Date().toISOString().split("T")[0];
  // Tightened scope: only 3 fields are extracted. Other MorningBrief fields
  // stay as empty arrays so existing UI (which checks .length) keeps working.
  return {
    date: typeof parsed.date === "string" && parsed.date.length >= 8 ? parsed.date : todayIso,
    forecast: arr(parsed.forecast),
    gss: [],
    comments: [],
    specialEvents: arr(parsed.specialEvents),
    ambassadors: arr(parsed.ambassadors),
    topVips: [],
    complaints: [],
    groups: [],
  };
}

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      securityError("service_unconfigured"),
      { status: 500 }
    );
  }

  const policy = getRoutePolicy("/api/ocr-morning-brief")!;
  let hold: AiBudgetHold | null = null;
  let settled = false;
  let providerCalled = false;

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request. Send multipart form data with PDF or image files." },
        { status: 400 }
      );
    }

    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0 || files.length > MAX_BRIEF_FILES) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // This route runs OCR per file AND a chat completion, so it is the most
    // expensive one. Reserve before reading anything.
    const budget = await holdBudget(request, policy);
    if (!budget.ok) return budget.response;
    hold = budget.hold;

    const provider = getAiProvider();
    const sections: string[] = [];
    let pagesBilled = 0;

    // One shared byte budget across every file, rather than N x the per-file
    // cap, which let five files total five times the intended ceiling.
    let remainingBytes = policy.maxBodyBytes;

    for (const file of files) {
      const read = await readValidatedFile(file, policy, remainingBytes);
      if (!read.ok || !read.bytes || !read.detectedType) {
        // The file name is caller input and can carry a guest name, so it is
        // not echoed back the way it used to be.
        return guardError(read.code ?? "invalid_request");
      }
      remainingBytes -= read.bytes.byteLength;

      providerCalled = true;
      const { markdown, pagesProcessed } = await provider.ocr({
        base64: read.bytes.toString("base64"),
        mimeType: read.detectedType,
        signal: request.signal,
      });
      pagesBilled += pagesProcessed ?? 1;
      sections.push(markdown);
    }

    const document = sections.join("\n\n---\n\n");
    const parsed = await provider.extractJson<Record<string, unknown>>({
      prompt: EXTRACTION_PROMPT,
      document,
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "morning_brief",
      signal: request.signal,
    });

    // Token counts are not surfaced by the provider interface, so the chat
    // half is estimated from input size (~4 chars/token) and the configured
    // output ceiling. Deliberately an over-estimate.
    await settleOk(
      hold,
      ocrCost(pagesBilled) +
        chatCost((EXTRACTION_PROMPT.length + document.length) / 4, 16_384),
    );
    settled = true;

    return NextResponse.json({ brief: normalizeBrief(parsed) });
  } catch (err) {
    console.error(safeLogError("OCR morning-brief route error:", err));
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.status === 429 ? "Rate limit exceeded." : "AI processing failed." },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Processing failed. Please try again." },
      { status: 500 }
    );
  } finally {
    // Release ONLY if the provider was never reached. Once a call is made we
    // may already have been billed for it — a multi-page OCR that fails
    // part-way still pays for the pages it processed — so a failure after
    // that point keeps the pessimistic reservation. Under-spending is the
    // safe direction for a cap; releasing here would let repeated failures
    // spend without ever being counted.
    if (hold && !settled && !providerCalled) await settleFailed(hold);
  }
}
