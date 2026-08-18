import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { getAiProvider, hasMistralKey, AiError } from "@/lib/ai";

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

// Comparing two lists and reporting differences is a reasoning task, not a
// transcription one — so this route OCRs the PDF first, then asks the chat
// model to reconcile the transcription against what we extracted.
function buildVerificationPrompt(
  docType: string,
  extractedClients: ExtractedClient[]
): string {
  return `You are a data verification assistant. Guest data was extracted from a hotel document. The document's OCR transcription follows in the user message.

Document type: ${docType}

Extracted data (${extractedClients.length} entries):
${JSON.stringify(extractedClients, null, 2)}

Verify the extraction against the transcription. Check for:
1. Missing entries (rooms in the document but not in the extracted data)
2. Extra entries (rooms in the extracted data but not in the document)
3. Incorrect data (wrong names, wrong guest counts, wrong room numbers)
4. Total count accuracy

If everything matches, set verified: true, confidence: 100, and empty arrays for missing/extra/corrections. Report only real differences — never invent a discrepancy.`;
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "verified", "totalInPdf", "totalExtracted",
    "missing", "extra", "corrections", "confidence", "summary",
  ],
  properties: {
    verified: { type: "boolean" },
    totalInPdf: { type: "number" },
    totalExtracted: { type: "number" },
    missing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roomNumber", "name"],
        properties: { roomNumber: { type: "string" }, name: { type: "string" } },
      },
    },
    extra: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roomNumber", "name"],
        properties: { roomNumber: { type: "string" }, name: { type: "string" } },
      },
    },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roomNumber", "field", "extracted", "actual"],
        properties: {
          roomNumber: { type: "string" },
          field: { type: "string" },
          extracted: { type: "string" },
          actual: { type: "string" },
        },
      },
    },
    confidence: { type: "number" },
    summary: { type: "string" },
  },
} as const;

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      { error: "OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)." },
      { status: 500 }
    );
  }

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

    const provider = getAiProvider();

    const { markdown } = await provider.ocr({
      base64: body.pdfBase64,
      mimeType: "application/pdf",
      signal: request.signal,
    });

    const parsed = await provider.extractJson<Partial<VerificationReport>>({
      prompt: buildVerificationPrompt(body.docType, body.extractedClients),
      document: markdown,
      schema: REPORT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: "verification_report",
      signal: request.signal,
    });

    // Same defensive normalisation as before — the response shape the UI reads
    // is unchanged.
    const report: VerificationReport = {
      verified: typeof parsed.verified === "boolean" ? parsed.verified : false,
      totalInPdf: typeof parsed.totalInPdf === "number" ? parsed.totalInPdf : 0,
      totalExtracted: typeof parsed.totalExtracted === "number" ? parsed.totalExtracted : body.extractedClients.length,
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      extra: Array.isArray(parsed.extra) ? parsed.extra : [],
      // Drop non-corrections. Observed live: the model sometimes reports a row
      // where `extracted` equals `actual` "for clarity", which reads to
      // reception as a real discrepancy and erodes trust in the whole report.
      corrections: Array.isArray(parsed.corrections)
        ? parsed.corrections.filter((c) => c && c.extracted !== c.actual)
        : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "Verification completed.",
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error(safeLogError("Verify extraction route error:", err));
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.status === 429 ? "Rate limit exceeded. Please wait a moment and try again." : "AI verification failed. Try again later." },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
