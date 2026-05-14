import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
// Pro for morning brief: accuracy >> speed for a once-per-day upload.
// Flash was hallucinating room numbers, names, and duty cycles.
const GEMINI_MODEL = "gemini-2.5-pro";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EXTRACTION_PROMPT = `You extract ONLY 4 sections from the Marriott Courtyard "Briefing du Matin" (French): FORECAST table, anniversaire/honeymoon events (EVENEMENTS SPECIAUX), and CLIENT AMBASSADORS. Skip everything else. The document spans 2 pages — extract from ALL pages provided. Return ONLY valid JSON — no markdown fences, no commentary.

Schema:
{
  "date": "YYYY-MM-DD",
  "forecast": [
    { "date": "<label like 'Mercredi 29/04'>", "sellLimit": number, "occupied": number, "occupiedComp": number, "occupancyPercent": number, "arrivals": number, "departures": number }
  ],
  "specialEvents": [
    { "type": "anniversaire | honeymoon | anniversary-stay | other", "guestName": "<name>", "roomNumber": "<3-digit>", "reason": "<free text>", "status": "in_house | arriving", "arrivalDate": "<DD/MM → DD/MM>" }
  ],
  "ambassadors": [
    { "guestName": "<name>", "roomNumber": "<3-digit>", "status": "in_house | arriving", "notes": "<optional>" }
  ]
}

CRITICAL ANTI-HALLUCINATION RULES — read carefully:
1. NEVER invent a name or room number. If you cannot read a digit confidently, return "" / 0.
2. NEVER complete or "fix" a name that looks misspelled — copy what is printed EXACTLY (e.g. "HEYSCHELABORDE", not "REYSCHDELABORDE").
3. For the FORECAST table: read column-by-column, top-to-bottom. Each of the 7 day columns has these rows IN ORDER: # Sell limit, # Occupied, # Occupied minus COMP, TO %, # Arrivals, # Departure. Do NOT shuffle rows. "# Sell limit" is usually the SAME number (e.g. 339) for every column.
4. Skip every section that is not FORECAST, EVENEMENTS SPECIAUX, or CLIENT AMBASSADORS. Ignore GSS, COMMENTAIRES CLIENTS, DUTY, GROUPES, FRONT OFFICE, PLAINTES, TOP VIPs, THEME DU JOUR, VALEURS, INTERNAL ANNIVERSARY entirely.

Field rules:
- "date" must be ISO YYYY-MM-DD parsed from the printed header (e.g. "JEUDI 30 AVRIL 2026" → "2026-04-30").
- "occupancyPercent" is a number (e.g. 46.02 not "46.02%").
- "occupiedComp" comes from the "# Occupied minus COMP" row, NOT the "# Occupied" row.
- For SPECIAL EVENTS: "Du 19 au 03/05" → arrivalDate "19/04 → 03/05" (infer month from context). Section header: "IN HOUSE" → in_house, "EN ARRIVÉE" → arriving.
- Room numbers in SPECIAL EVENTS and AMBASSADORS are printed with a "#" prefix (e.g. "#707"). Extract ONLY the 3 digits ("707"). Read each digit carefully — these are critical for cross-referencing the breakfast list.
- Ambassadors section header "IN HOUSE" → status in_house, "EN ARRIVÉE" → arriving.
- If the document is not a Marriott Briefing du Matin, return {"date":"","forecast":[],"specialEvents":[],"ambassadors":[]}.
- Return ONLY the JSON object.`;

async function uploadToGeminiFiles(
  apiKey: string,
  bytes: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ fileUri: string }> {
  const initRes = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Files API init failed: ${initRes.status} ${errText}`);
  }

  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Files API");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(bytes),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Files API upload failed: ${uploadRes.status} ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri: string = uploadData.file?.uri;
  if (!fileUri) throw new Error("No file URI returned from Files API");

  return { fileUri };
}

async function deleteGeminiFile(apiKey: string, fileUri: string): Promise<void> {
  try {
    const match = fileUri.match(/files\/[^/]+$/);
    if (!match) return;
    await fetch(`${GEMINI_API_BASE}/v1beta/${match[0]}?key=${apiKey}`, {
      method: "DELETE",
    });
  } catch {
    // Best-effort cleanup
  }
}

async function callGemini(
  apiKey: string,
  files: Array<{ uri: string; mimeType: string }>
): Promise<Response> {
  const parts: Array<Record<string, unknown>> = [{ text: EXTRACTION_PROMPT }];
  for (const f of files) {
    parts.push({ file_data: { mime_type: f.mimeType, file_uri: f.uri } });
  }
  return fetch(
    `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
          // Allow thinking — without it, Pro/Flash hallucinated room numbers
          // and duty schedules on dense tables.
          thinkingConfig: { thinkingBudget: 8192 },
        },
      }),
    }
  );
}

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
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const uploadedFiles: Array<{ uri: string; mimeType: string }> = [];

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
      const buffer = Buffer.from(bytes);
      const uploaded = await uploadToGeminiFiles(
        apiKey,
        buffer,
        file.name || "morning-brief",
        mimeType
      );
      uploadedFiles.push({ uri: uploaded.fileUri, mimeType });
    }

    let response = await callGemini(apiKey, uploadedFiles);
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      response = await callGemini(apiKey, uploadedFiles);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(safeLogError("Gemini API error (morning-brief):", errorText));
      return NextResponse.json(
        { error: response.status === 429 ? "Rate limit exceeded." : "AI processing failed." },
        { status: response.status }
      );
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const rawText: string = textPart?.text || "{}";

    const cleaned = rawText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(safeLogError("Failed to parse Gemini morning-brief response:", cleaned));
      return NextResponse.json(
        { error: "AI returned invalid data. Try again." },
        { status: 500 }
      );
    }

    const brief = normalizeBrief(parsed);
    return NextResponse.json({ brief });
  } catch (err) {
    console.error(safeLogError("OCR morning-brief route error:", err));
    return NextResponse.json(
      { error: "Processing failed. Please try again." },
      { status: 500 }
    );
  } finally {
    for (const f of uploadedFiles) {
      deleteGeminiFile(apiKey, f.uri);
    }
  }
}
