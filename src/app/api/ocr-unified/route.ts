import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
];

const UNIFIED_PROMPT = `You are a hotel document data extraction assistant. This image is either:
A) A daily guest/client list report (columns: room number, room type, name, arrival, departure, adults, children, etc.)
B) A VIP guest report ("Guest InHouse VIP" or similar, with VIP codes, special preferences)

First, determine which type this document is. Then extract ALL rows.

If it's a CLIENT LIST (type A), return this JSON:
{
  "type": "clients",
  "data": [
    {
      "roomNumber": "string (3-4 digits)",
      "roomType": "string (e.g. DLXK, PRMK)",
      "rtc": "string",
      "confirmationNumber": "string",
      "name": "string (guest full name EXACTLY as printed — do NOT reformat, reverse, or abbreviate. Copy character by character.)",
      "arrivalDate": "string (e.g. 05/03/26)",
      "departureDate": "string",
      "reservationStatus": "string (e.g. DUOT, CKIN)",
      "adults": "number",
      "children": "number",
      "rateCode": "string",
      "packageCode": "string (e.g. BKF GRP, BKF INC)"
    }
  ]
}

If it's a VIP LIST (type B), return this JSON:
{
  "type": "vip",
  "data": [
    {
      "roomNumber": "string",
      "name": "string (full name EXACTLY as printed — do NOT reformat or reverse)",
      "vipLevel": "string (e.g. X4, P6)",
      "vipNotes": "string (all specials and preferences combined)",
      "confirmationNumber": "string",
      "arrivalDate": "string",
      "departureDate": "string",
      "roomType": "string",
      "adults": "number",
      "children": "number",
      "rateCode": "string"
    }
  ]
}

Rules:
- Extract EVERY row visible in the image, do not skip any
- If a field is not visible or unclear, use "" for strings and 0 for numbers
- Return ONLY the JSON object, no markdown, no explanation, no code fences
- If you cannot read the image or it's not a hotel report, return {"type": "unknown", "data": []}`;

function validateEntry(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.roomNumber === "string" &&
    obj.roomNumber.length > 0 &&
    typeof obj.name === "string"
  );
}

async function callGemini(
  apiKey: string,
  base64: string,
  mimeType: string
): Promise<Response> {
  return fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: UNIFIED_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Use JPEG, PNG, or WebP.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }
    const base64 = Buffer.from(bytes).toString("base64");

    let response = await callGemini(apiKey, base64, mimeType);

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      response = await callGemini(apiKey, base64, mimeType);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);

      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "AI processing failed. Try again or paste data manually." },
        { status: response.status }
      );
    }

    const result = await response.json();

    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const textContent = textPart?.text || '{"type":"unknown","data":[]}';

    const cleaned = textContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid data. Try again or paste data manually." },
        { status: 500 }
      );
    }

    const docType = parsed.type || "unknown";
    const data = Array.isArray(parsed.data) ? parsed.data.filter(validateEntry) : [];

    if (docType === "vip") {
      return NextResponse.json({ type: "vip", vipEntries: data });
    } else if (docType === "clients") {
      return NextResponse.json({ type: "clients", clients: data });
    } else {
      // Unknown — return as clients if data exists, empty otherwise
      return NextResponse.json({ type: "unknown", clients: data });
    }
  } catch (err) {
    console.error("Unified OCR route error:", err);
    return NextResponse.json(
      {
        error: `Processing failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}
