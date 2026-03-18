import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
];

const VIP_EXTRACTION_PROMPT = `You are a data extraction assistant. Extract ALL VIP guest rows from this hotel "Guest InHouse VIP" report image into a JSON array.

Each row must have these exact fields:
- roomNumber (string): the room number
- name (string): guest full name EXACTLY as printed in the report. Do NOT reformat, reverse, or abbreviate. If it shows "LASTNAME, Firstname" keep it as "LASTNAME, Firstname". Copy character by character.
- vipLevel (string): the VIP code (e.g. "X4", "P6")
- vipNotes (string): all special notes/preferences for this guest (e.g. "Member Rate (M5), High Floor Room (H1), Non Smoking Room (N3)")
- confirmationNumber (string): the CRS No. / confirmation number
- arrivalDate (string): arrival date exactly as shown
- departureDate (string): departure date exactly as shown
- roomType (string): room type code if visible
- adults (number): number of adults
- children (number): number of children
- rateCode (string): rate code if visible

Rules:
- Extract EVERY VIP row visible, do not skip any
- Combine all "Specials" and "Preferences" text into vipNotes
- If a field is not visible or unclear, use "" for strings and 0 for numbers
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences
- If you cannot read the image or it's not a VIP report, return []`;

function validateVipEntry(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.roomNumber === "string" &&
    obj.roomNumber.length > 0 &&
    typeof obj.name === "string" &&
    obj.name.length > 0
  );
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

    let response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: VIP_EXTRACTION_PROMPT },
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

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: VIP_EXTRACTION_PROMPT },
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
        { error: "AI processing failed. Try again." },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Gemini 2.5 Flash uses thinking — the actual text is the LAST non-thought text part
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const textContent = textPart?.text || "[]";

    const cleaned = textContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let entries;
    try {
      entries = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini VIP response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid data. Try again." },
        { status: 500 }
      );
    }

    if (!Array.isArray(entries)) {
      return NextResponse.json(
        { error: "AI returned unexpected format. Try again." },
        { status: 500 }
      );
    }

    const validEntries = entries.filter(validateVipEntry);

    return NextResponse.json({ vipEntries: validEntries });
  } catch (err) {
    console.error("VIP OCR route error:", err);
    return NextResponse.json(
      {
        error: "Processing failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
