import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_BODY_SIZE = 25 * 1024 * 1024; // 25MB

interface ExtractedClient {
  roomNumber: string;
  name: string;
  adults: number;
  children: number;
  [key: string]: unknown;
}

interface VerifyRequest {
  pdfBase64: string;
  extractedClients: ExtractedClient[];
  docType: "clients" | "vip" | "unknown";
}

interface VerificationReport {
  verified: boolean;
  totalInPdf: number;
  totalExtracted: number;
  missing: { roomNumber: string; name: string }[];
  extra: { roomNumber: string; name: string }[];
  corrections: {
    roomNumber: string;
    field: string;
    extracted: string;
    actual: string;
  }[];
  confidence: number;
  summary: string;
}

function buildVerificationPrompt(
  docType: string,
  extractedClients: ExtractedClient[]
): string {
  return `You are a data verification assistant. I've extracted guest data from this hotel PDF document.

Document type: ${docType}

Extracted data (${extractedClients.length} entries):
${JSON.stringify(extractedClients, null, 2)}

Please verify the extraction by comparing it against the original PDF. Check for:
1. Missing entries (rooms in PDF but not in extracted data)
2. Extra entries (rooms in extracted data but not in PDF)
3. Incorrect data (wrong names, wrong guest counts, wrong room numbers)
4. Total count accuracy

Return a JSON object:
{
  "verified": boolean,
  "totalInPdf": number,
  "totalExtracted": number,
  "missing": [{"roomNumber": "string", "name": "string"}],
  "extra": [{"roomNumber": "string", "name": "string"}],
  "corrections": [{"roomNumber": "string", "field": "string", "extracted": "string", "actual": "string"}],
  "confidence": number (0-100),
  "summary": "string"
}

If everything matches perfectly, set verified: true, confidence: 100, and empty arrays for missing/extra/corrections.
Return ONLY valid JSON, no markdown, no code fences.`;
}

/**
 * Upload PDF bytes to Gemini Files API, returning the file URI.
 */
async function uploadToGeminiFiles(
  apiKey: string,
  pdfBytes: Buffer,
  fileName: string
): Promise<string> {
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
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  if (!initRes.ok) {
    throw new Error(`Files API init failed: ${initRes.status}`);
  }

  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL from Files API");

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
    throw new Error(`Files API upload failed: ${uploadRes.status}`);
  }

  const data = await uploadRes.json();
  return data.file?.uri || "";
}

async function deleteGeminiFile(apiKey: string, fileUri: string): Promise<void> {
  try {
    const match = fileUri.match(/files\/[^/]+$/);
    if (!match) return;
    await fetch(`${GEMINI_API_BASE}/v1beta/${match[0]}?key=${apiKey}`, { method: "DELETE" });
  } catch {
    // Best-effort cleanup
  }
}

async function callGeminiWithFile(
  apiKey: string,
  fileUri: string,
  prompt: string
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
              { text: prompt },
              { file_data: { mime_type: "application/pdf", file_uri: fileUri } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
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
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large. Maximum size is 25MB." },
        { status: 413 }
      );
    }

    const body: VerifyRequest = await request.json();

    if (!body.pdfBase64 || typeof body.pdfBase64 !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid pdfBase64 field" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.extractedClients)) {
      return NextResponse.json(
        { error: "Missing or invalid extractedClients array" },
        { status: 400 }
      );
    }

    if (!body.docType || !["clients", "vip", "unknown"].includes(body.docType)) {
      return NextResponse.json(
        { error: "Missing or invalid docType" },
        { status: 400 }
      );
    }

    // Decode base64 to bytes and upload to Files API
    const pdfBytes = Buffer.from(body.pdfBase64, "base64");
    fileUri = await uploadToGeminiFiles(apiKey, pdfBytes, "verification.pdf");

    if (!fileUri) {
      return NextResponse.json(
        { error: "Failed to upload PDF for verification" },
        { status: 500 }
      );
    }

    const prompt = buildVerificationPrompt(body.docType, body.extractedClients);

    let response = await callGeminiWithFile(apiKey, fileUri, prompt);

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      response = await callGeminiWithFile(apiKey, fileUri, prompt);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error (verify-extraction):", errorText);

      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "AI verification failed. Try again later." },
        { status: response.status }
      );
    }

    const result = await response.json();

    const parts = result.candidates?.[0]?.content?.parts || [];
    const textPart = [...parts].reverse().find(
      (p: Record<string, unknown>) => typeof p.text === "string" && !p.thought
    );
    const rawText: string =
      textPart?.text ||
      '{"verified":false,"totalInPdf":0,"totalExtracted":0,"missing":[],"extra":[],"corrections":[],"confidence":0,"summary":"No response from AI."}';

    const cleaned = rawText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: VerificationReport;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse verification response:", cleaned);
      return NextResponse.json(
        { error: "AI returned invalid verification data. Try again." },
        { status: 500 }
      );
    }

    const report: VerificationReport = {
      verified: typeof parsed.verified === "boolean" ? parsed.verified : false,
      totalInPdf: typeof parsed.totalInPdf === "number" ? parsed.totalInPdf : 0,
      totalExtracted: typeof parsed.totalExtracted === "number" ? parsed.totalExtracted : body.extractedClients.length,
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      extra: Array.isArray(parsed.extra) ? parsed.extra : [],
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "Verification completed.",
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error("Verify extraction route error:", err);
    return NextResponse.json(
      {
        error: "Verification failed. Please try again.",
      },
      { status: 500 }
    );
  } finally {
    if (fileUri) {
      deleteGeminiFile(apiKey, fileUri);
    }
  }
}
