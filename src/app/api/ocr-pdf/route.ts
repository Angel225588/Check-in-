import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { sanitizeAndValidateClient, sanitizeAndValidatePackageRow } from "@/lib/validate";
import { hasMistralKey, AiError } from "@/lib/ai";
import { ocrPdfComplete, IncompleteOcrError } from "@/lib/ocr-document";
import {
  parseMistralMarkdown,
  parseMistralVip,
  parseMistralPackageRows,
  parseMistralPackageTotals,
  detectDocType,
} from "@/lib/mistral-parser";

// Mistral OCR reads the whole PDF in one call and returns markdown, so the
// page-chunking this route used for Gemini is gone: there is no per-call page
// budget to work around, and one call cannot half-succeed the way parallel
// chunks could. maxDuration stays as a safety net for very large scans.
export const maxDuration = 300;
export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      { error: "OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)." },
      { status: 500 },
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request. Send multipart form data with a PDF." },
        { status: 400 },
      );
    }

    const file = (formData.get("file") || formData.get("pdf")) as File | null;
    if (!file) {
      return NextResponse.json({ error: "No PDF provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Splits long reports into page-chunks and asserts every page came back.
    // Either the whole roster, or a loud failure — never a silent short read.
    const { markdown, pages, chunks } = await ocrPdfComplete(
      new Uint8Array(bytes),
      request.signal,
    );

    const type = detectDocType(markdown);
    // Transcription-only: the markdown is parsed deterministically, so a room
    // number or guest name can never be invented by a model.
    const rawClients = type === "vip" ? parseMistralVip(markdown) : parseMistralMarkdown(markdown);

    const clients =
      type === "vip"
        ? rawClients.filter((c) => c.roomNumber && c.name)
        : rawClients.filter((c) => sanitizeAndValidateClient(c as unknown as Record<string, unknown>));

    // The hotel's own per-day breakfast totals from the last page. This is the
    // authoritative COMP/GRP/INC count — reception is judged against it, so we
    // carry it through instead of only deriving numbers from the guest rows.
    const packageTotals = parseMistralPackageTotals(markdown);

    const packageRows = parseMistralPackageRows(markdown).filter((r) =>
      sanitizeAndValidatePackageRow(r as unknown as Record<string, unknown>),
    );

    // Same response shape the UI already consumes (type / pages / clients /
    // packageRows). `engine` is additive and ignored by existing callers.
    return NextResponse.json({ type, pages, clients, packageRows, packageTotals, chunks, engine: "mistral" });
  } catch (err) {
    console.error(safeLogError("OCR PDF route error:", err));
    if (err instanceof IncompleteOcrError) {
      // Surface incompleteness explicitly: a partial roster must never look
      // like a successful upload.
      return NextResponse.json(
        { error: "Document incomplet — toutes les pages n'ont pas été lues. Réessaie." },
        { status: 502 },
      );
    }
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.status === 429 ? "Rate limit exceeded. Please wait a moment and try again." : "AI processing failed. Try again." },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { error: "PDF processing failed. Try again or paste data manually." },
      { status: 500 },
    );
  }
}
