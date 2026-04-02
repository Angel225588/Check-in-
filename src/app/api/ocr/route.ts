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

const EXTRACTION_PROMPT = `You are a data extraction assistant. Extract ALL guest/client rows from this hotel report image into a JSON array.

Each row must have these exact fields:
- roomNumber (string): the room number (3-4 digits)
- roomType (string): room type code (e.g. DLXK, PRMK, STHT, STKD, STKG)
- rtc (string): RTC code if present, otherwise ""
- confirmationNumber (string): the confirmation/reservation number
- name (string): guest full name EXACTLY as printed in the report. Do NOT reformat, reverse, or abbreviate. If it shows "LASTNAME, Firstname" keep it as "LASTNAME, Firstname". Copy character by character.
- arrivalDate (string): arrival date exactly as shown (e.g. "05/03/26")
- departureDate (string): departure date exactly as shown
- reservationStatus (string): status code (e.g. DUOT, CKIN, COUT, DKIN, NOSH)
- adults (number): number of adults
- children (number): number of children
- rateCode (string): rate code if present
- packageCode (string): package code if present (e.g. BKF GRP, BKF INC)

Rules:
- Extract EVERY row visible in the image, do not skip any
- If a field is not visible or unclear, use "" for strings and 0 for numbers
- Return ONLY a valid JSON array, no markdown, no explanation, no code fences
- If you cannot read the image or it's not a report, return []`;

import { sanitizeAndValidateClient } from "@/lib/validate";

function validateClient(obj: Record<string, unknown>): boolean {
  return sanitizeAndValidateClient(obj);
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
            { text: EXTRACTION_PROMPT },
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
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request. Send multipart form data with an image." },
        { status: 400 }
      );
    }
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Validate MIME type
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        {
          error: "Unsupported file type. Use JPEG, PNG, or WebP.",
        },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }
    const base64 = Buffer.from(bytes).toString("base64");

    // Call Gemini with one retry on rate limit
    let response = await callGemini(apiKey, base64, mimeType);

    if (response.status === 429) {
      // Wait and retry once
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

    // Gemini 2.5 Flash uses thinking — parts[0] may be the thought,
    // the actual text is the LAST text part in the array
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const textContent = textPart?.text || "[]";

    // Clean up the response - remove markdown fences if present
    const cleaned = textContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let clients;
    try {
      clients = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid data. Try again or paste data manually." },
        { status: 500 }
      );
    }

    if (!Array.isArray(clients)) {
      return NextResponse.json(
        { error: "AI returned unexpected format. Try again or paste data manually." },
        { status: 500 }
      );
    }

    // Validate and filter clients
    const validClients = clients.filter(validateClient);

    return NextResponse.json({ clients: validClients });
  } catch (err) {
    console.error("OCR route error:", err);
    return NextResponse.json(
      {
        error: "Processing failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
