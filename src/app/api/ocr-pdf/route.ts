import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const EXTRACTION_PROMPT = `You are a data extraction assistant for hotel daily reports. This PDF contains a multi-page hotel report.

First, determine the document type:
- "clients" = daily guest/arrival list with room numbers, names, dates, adults/children
- "vip" = VIP guest list with VIP levels, special notes, loyalty status

Then extract ALL guest/client rows from ALL pages into a JSON object.

Return format:
{
  "type": "clients" | "vip",
  "pages": <number of pages processed>,
  "clients": [
    {
      "roomNumber": "string",
      "roomType": "string",
      "rtc": "string",
      "confirmationNumber": "string",
      "name": "string",
      "arrivalDate": "string",
      "departureDate": "string",
      "reservationStatus": "string",
      "adults": number,
      "children": number,
      "rateCode": "string",
      "packageCode": "string",
      "isVip": boolean,
      "vipLevel": "string (if VIP doc)",
      "vipNotes": "string (if VIP doc)"
    }
  ]
}

Rules:
- Extract EVERY row from EVERY page, do not skip any
- If a field is not visible or unclear, use "" for strings and 0 for numbers
- For VIP documents, set isVip: true for all entries
- Return ONLY valid JSON, no markdown, no explanation, no code fences
- If you cannot read the PDF or it's not a hotel report, return {"type":"unknown","pages":0,"clients":[]}`;

function stripHtml(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
}

function sanitizeClient(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") obj[key] = stripHtml(obj[key]).slice(0, 200);
  }
  return obj;
}

function validateClient(obj: Record<string, unknown>): boolean {
  sanitizeClient(obj);
  return (
    typeof obj.roomNumber === "string" &&
    obj.roomNumber.length > 0 &&
    typeof obj.name === "string"
  );
}

/**
 * Upload a file to Gemini Files API, returning the file URI.
 * This is required because inline_data does not support PDFs.
 */
async function uploadToGeminiFiles(
  apiKey: string,
  pdfBytes: Buffer,
  fileName: string
): Promise<{ fileUri: string }> {
  // Step 1: Start resumable upload
  const initRes = await fetch(
    `${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(pdfBytes.length),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: { displayName: fileName },
      }),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Files API init failed: ${initRes.status} ${errText}`);
  }

  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Files API");

  // Step 2: Upload the bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(pdfBytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(pdfBytes),
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

/**
 * Delete a file from Gemini Files API (cleanup).
 */
async function deleteGeminiFile(apiKey: string, fileUri: string): Promise<void> {
  try {
    // Extract file name from URI: "https://...googleapis.com/v1beta/files/abc123" → "files/abc123"
    const match = fileUri.match(/files\/[^/]+$/);
    if (!match) return;
    await fetch(`${GEMINI_API_BASE}/v1beta/${match[0]}?key=${apiKey}`, {
      method: "DELETE",
    });
  } catch {
    // Best-effort cleanup, ignore errors
  }
}

async function callGeminiWithFile(
  apiKey: string,
  fileUri: string
): Promise<Response> {
  return fetch(
    `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              { file_data: { mime_type: "application/pdf", file_uri: fileUri } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
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

  let fileUri: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No PDF file provided" },
        { status: 400 }
      );
    }

    // Validate MIME type
    const mimeType = file.type || "";
    if (mimeType !== "application/pdf") {
      return NextResponse.json(
        {
          error: "Unsupported file type. Only PDF files are accepted.",
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    // Read file bytes
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      );
    }
    const pdfBuffer = Buffer.from(bytes);

    // Upload to Gemini Files API
    const uploaded = await uploadToGeminiFiles(apiKey, pdfBuffer, file.name || "report.pdf");
    fileUri = uploaded.fileUri;

    // Call Gemini with the file reference
    let response = await callGeminiWithFile(apiKey, fileUri);

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      response = await callGeminiWithFile(apiKey, fileUri);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error (PDF):", errorText);

      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "AI processing failed. Try again or upload images instead." },
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
    const rawText: string = textPart?.text || '{"type":"unknown","pages":0,"clients":[]}';

    // Clean up the response - remove markdown fences if present
    const cleaned = rawText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini PDF response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid data. Try again or upload images instead." },
        { status: 500 }
      );
    }

    // Normalize: ensure we have the expected shape
    const docType: string = parsed.type || "unknown";
    const pages: number = typeof parsed.pages === "number" ? parsed.pages : 0;
    const clients: Record<string, unknown>[] = Array.isArray(parsed.clients)
      ? parsed.clients
      : Array.isArray(parsed)
        ? parsed
        : [];

    // Validate and filter clients
    const validClients = clients.filter(validateClient);

    return NextResponse.json({
      type: docType,
      pages,
      clients: validClients,
    });
  } catch (err) {
    console.error("OCR PDF route error:", err);
    return NextResponse.json(
      {
        error: "Processing failed. Please try again.",
      },
      { status: 500 }
    );
  } finally {
    // Clean up uploaded file
    if (fileUri) {
      deleteGeminiFile(apiKey, fileUri);
    }
  }
}
