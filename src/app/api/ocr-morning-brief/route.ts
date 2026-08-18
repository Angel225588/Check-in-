import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { getAiProvider, hasMistralKey, AiError } from "@/lib/ai";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
    duty: [],
    groups: [],
  };
}

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      { error: "OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)." },
      { status: 500 }
    );
  }

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
    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (files.length > 5) {
      return NextResponse.json(
        { error: "Too many files. Maximum 5 pages per upload." },
        { status: 400 }
      );
    }

    const provider = getAiProvider();
    const sections: string[] = [];

    for (const file of files) {
      const mimeType = file.type || "";
      if (!ALLOWED_TYPES.has(mimeType)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.name || mimeType}. PDF, JPG, PNG, or WEBP only.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum size is 20MB per file.` },
          { status: 400 }
        );
      }
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength === 0) {
        return NextResponse.json({ error: `File is empty: ${file.name}` }, { status: 400 });
      }

      const { markdown } = await provider.ocr({
        base64: Buffer.from(bytes).toString("base64"),
        mimeType,
        signal: request.signal,
      });
      sections.push(markdown);
    }

    const parsed = await provider.extractJson<Record<string, unknown>>({
      prompt: EXTRACTION_PROMPT,
      document: sections.join("\n\n---\n\n"),
      schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "morning_brief",
      signal: request.signal,
    });

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
  }
}
