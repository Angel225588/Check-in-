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
import { safeLogError } from "@/lib/log-safe";
import { parseMistralMarkdown } from "@/lib/mistral-parser";
import type { Client } from "@/lib/types";

function validateClient(obj: Record<string, unknown>): boolean {
  return sanitizeAndValidateClient(obj);
}

// Mistral OCR 4 (EU) — returns structured markdown tables; we parse them to Client[].
async function callMistralOcr(
  apiKey: string,
  base64: string,
  mimeType: string
): Promise<Client[]> {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const document =
    mimeType === "application/pdf"
      ? { type: "document_url", document_url: dataUrl }
      : { type: "image_url", image_url: dataUrl };
  const r = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral-ocr-latest", document, include_image_base64: false }),
  });
  if (!r.ok) throw new Error(`Mistral OCR HTTP ${r.status}`);
  const j = await r.json();
  const md = (j.pages || []).map((p: { markdown?: string }) => p.markdown || "").join("\n");
  return parseMistralMarkdown(md);
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
  const mistralKey = process.env.MISTRAL_API_KEY;
  const hasGemini = !!apiKey && apiKey !== "your_gemini_api_key_here";

  if (!mistralKey && !hasGemini) {
    return NextResponse.json(
      { error: "No OCR provider configured (set MISTRAL_API_KEY or GEMINI_API_KEY)" },
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

    // Prefer Mistral OCR (EU/sovereign) when configured; fall back to Gemini on any
    // failure or empty result so the upload flow can never break.
    if (mistralKey) {
      try {
        const parsed = await callMistralOcr(mistralKey, base64, mimeType);
        const valid = parsed.filter((c) =>
          validateClient(c as unknown as Record<string, unknown>)
        );
        if (valid.length > 0) {
          return NextResponse.json({ clients: valid, engine: "mistral" });
        }
      } catch (e) {
        console.error(safeLogError("Mistral OCR failed; falling back to Gemini", e));
      }
    }

    if (!hasGemini) {
      return NextResponse.json(
        { error: "OCR could not read the document. Try a clearer photo or paste manually." },
        { status: 502 }
      );
    }
    const geminiApiKey = apiKey as string;

    // Call Gemini with one retry on rate limit
    let response = await callGemini(geminiApiKey, base64, mimeType);

    if (response.status === 429) {
      // Wait and retry once
      await new Promise((r) => setTimeout(r, 3000));
      response = await callGemini(geminiApiKey, base64, mimeType);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(safeLogError("Gemini API error", errorText));

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
      console.error(safeLogError("Failed to parse Gemini response", cleaned));
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
    console.error(safeLogError("OCR route error", err));
    return NextResponse.json(
      {
        error: "Processing failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
