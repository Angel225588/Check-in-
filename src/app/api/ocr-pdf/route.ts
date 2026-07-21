import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import {
  shouldRetryStatus,
  parseJsonLoose,
  dedupClients,
  dedupPackageRows,
} from "@/lib/ocr-helpers";
import { splitPdfIntoChunks } from "@/lib/pdf-split";

// PDF OCR is heavy (Files API upload + multi-page extraction). A single call
// on a big report ran past 60s and hit FUNCTION_INVOCATION_TIMEOUT, so we now
// split into page-chunks and process them in parallel. maxDuration is raised
// as a safety net for very large uploads / rate-limit backoffs.
export const maxDuration = 300;
export const runtime = "nodejs";

// Pages per parallel chunk. A 15-page report → 3 short concurrent calls.
const PAGES_PER_CHUNK = 5;

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
      "packageCode": "string (the ENTIRE 'Package Codes' cell, all comma-separated codes)",
      "isVip": boolean,
      "vipLevel": "string (if VIP doc)",
      "vipNotes": "string (if VIP doc)"
    }
  ]
}

Occasionally a row lists a ROOM NUMBER and PACKAGE CODE but has NO guest name.
Put any such nameless room+package row in a separate top-level array "packageRows"
(do NOT put nameless rows in "clients"):

"packageRows": [
  { "roomNumber": "string", "packageCode": "string" }
]

Rules:
- Extract EVERY row from EVERY page, do not skip any
- Rows WITH a guest name go in "clients" (even if the room number is blank); only nameless room+package rows go in "packageRows"
- packageCode MUST be the ENTIRE "Package Codes" cell copied verbatim, including EVERY comma-separated code, e.g. "CITY TAX,BKF GRP", "CITY TAX,GARAGE,BKF COMP", or "CITY TAX" alone. NEVER drop CITY TAX, GARAGE, or the BKF/UPS code — breakfast and payment detection depend on the BKF code being present in this string.
- If a field is not visible or unclear, use "" for strings and 0 for numbers
- For VIP documents, set isVip: true for all entries
- Always include a "packageRows" array (use [] when there are none)
- Return ONLY valid JSON, no markdown, no explanation, no code fences
- If you cannot read the PDF or it's not a hotel report, return {"type":"unknown","pages":0,"clients":[],"packageRows":[]}`;

import { sanitizeAndValidateClient, sanitizeAndValidatePackageRow } from "@/lib/validate";

function validateClient(obj: Record<string, unknown>): boolean {
  return sanitizeAndValidateClient(obj);
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

interface ChunkResult {
  type: string;
  pages: number;
  clients: Record<string, unknown>[];
  packageRows: { roomNumber: string; packageCode: string }[];
}

/**
 * Extract one PDF chunk end-to-end: upload to the Files API, call Gemini
 * (retrying transient failures), parse and validate. Cleans up its uploaded
 * file. Throws on hard failure so the caller can count failed chunks.
 */
async function processChunk(
  apiKey: string,
  pdfBuffer: Buffer,
  displayName: string
): Promise<ChunkResult> {
  let fileUri: string | null = null;
  try {
    const uploaded = await uploadToGeminiFiles(apiKey, pdfBuffer, displayName);
    fileUri = uploaded.fileUri;

    // Retry transient upstream failures (429 + 5xx) with a short backoff.
    let response = await callGeminiWithFile(apiKey, fileUri);
    for (let attempt = 0; attempt < 2 && shouldRetryStatus(response.status); attempt++) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      response = await callGeminiWithFile(apiKey, fileUri);
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error(safeLogError("Gemini API error (PDF chunk):", errorText));
      throw new Error(`Gemini responded ${response.status}`);
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const rawText: string =
      textPart?.text || '{"type":"unknown","pages":0,"clients":[],"packageRows":[]}';

    const parsed = parseJsonLoose(rawText) as Record<string, unknown>;

    const type: string = (parsed.type as string) || "unknown";
    const pages: number = typeof parsed.pages === "number" ? parsed.pages : 0;
    const clientsRaw: Record<string, unknown>[] = Array.isArray(parsed.clients)
      ? parsed.clients
      : Array.isArray(parsed)
        ? (parsed as unknown as Record<string, unknown>[])
        : [];
    const packageRowsRaw: Record<string, unknown>[] = Array.isArray(parsed.packageRows)
      ? (parsed.packageRows as Record<string, unknown>[])
      : [];

    const clients = clientsRaw.filter(validateClient);
    const packageRows = packageRowsRaw
      .filter(sanitizeAndValidatePackageRow)
      .map((r) => ({ roomNumber: r.roomNumber as string, packageCode: r.packageCode as string }));

    return { type, pages, clients, packageRows };
  } finally {
    if (fileUri) deleteGeminiFile(apiKey, fileUri);
  }
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
        { error: "Invalid request. Send multipart form data with a PDF file." },
        { status: 400 }
      );
    }
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

    // Split large reports into page-chunks so no single Gemini call runs past
    // the function timeout. Falls back to the whole file if splitting fails.
    let chunks: Uint8Array[];
    try {
      chunks = await splitPdfIntoChunks(pdfBuffer, PAGES_PER_CHUNK);
    } catch (err) {
      console.error(safeLogError("PDF split failed, processing whole file:", err));
      chunks = [pdfBuffer];
    }

    const baseName = (file.name || "report.pdf").replace(/\.pdf$/i, "");

    // Process all chunks in parallel — wall-clock is the slowest single chunk,
    // not the sum of all of them.
    const settled = await Promise.allSettled(
      chunks.map((chunk, i) =>
        processChunk(apiKey, Buffer.from(chunk), `${baseName}-part${i + 1}.pdf`)
      )
    );

    const succeeded = settled.filter(
      (s): s is PromiseFulfilledResult<ChunkResult> => s.status === "fulfilled"
    );

    // Every chunk failed — surface an error so the UI can offer a retry.
    if (succeeded.length === 0) {
      const firstErr = settled.find((s) => s.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      console.error(safeLogError("All PDF chunks failed:", firstErr?.reason));
      return NextResponse.json(
        { error: "AI processing failed. Try again or upload images instead." },
        { status: 502 }
      );
    }

    // Merge chunk results, de-duplicating rows that straddle a chunk boundary.
    const clients = dedupClients(succeeded.flatMap((s) => s.value.clients));
    const packageRows = dedupPackageRows(succeeded.flatMap((s) => s.value.packageRows));
    const docType =
      succeeded.map((s) => s.value.type).find((t) => t && t !== "unknown") || "unknown";
    const pages = succeeded.reduce((sum, s) => sum + (s.value.pages || 0), 0);

    return NextResponse.json({
      type: docType,
      pages,
      clients,
      packageRows,
      chunks: chunks.length,
      chunksFailed: settled.length - succeeded.length,
    });
  } catch (err) {
    console.error(safeLogError("OCR PDF route error:", err));
    return NextResponse.json(
      {
        error: "Processing failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
