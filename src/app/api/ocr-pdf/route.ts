import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { securityError } from "@/lib/security/errors";
import { sanitizeAndValidateClient, sanitizeAndValidatePackageRow } from "@/lib/validate";
import { hasMistralKey, AiError } from "@/lib/ai";
import { ocrPdfComplete, IncompleteOcrError, countPdfPages } from "@/lib/ocr-document";
import { getRoutePolicy, MAX_PDF_PAGES } from "@/lib/security/config";
import {
  guardError,
  holdBudget,
  readValidatedFile,
  settleFailed,
  settleOk,
  type AiBudgetHold,
} from "@/lib/security/guard";
import { ocrCost } from "@/lib/security/budget";
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

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      securityError("service_unconfigured"),
      { status: 500 },
    );
  }

  const policy = getRoutePolicy("/api/ocr-pdf")!;
  let hold: AiBudgetHold | null = null;
  let settled = false;
  let providerCalled = false;

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

    const file = formData.get("file") || formData.get("pdf");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF provided" }, { status: 400 });
    }

    // This route previously checked size and NOTHING else — no type check at
    // all, so a renamed archive reached the provider unexamined. The bytes
    // decide now.
    const read = await readValidatedFile(file, policy);
    if (!read.ok || !read.bytes) {
      return guardError(read.code ?? "invalid_request");
    }
    const bytes = new Uint8Array(read.bytes);

    // OCR bills per page, and the count is knowable locally. Refusing an
    // oversized document here costs nothing; discovering it downstream costs
    // one page's billing per page.
    const pageCount = await countPdfPages(bytes);
    if (pageCount !== null && pageCount > MAX_PDF_PAGES) {
      return guardError("too_many_pages");
    }

    // Reserve against the real page count rather than the policy ceiling, so
    // a two-page upload does not hold sixty pages' worth of budget.
    const budget = await holdBudget(
      request,
      policy,
      ocrCost(pageCount ?? MAX_PDF_PAGES),
    );
    if (!budget.ok) return budget.response;
    hold = budget.hold;

    // Splits long reports into page-chunks and asserts every page came back.
    // Either the whole roster, or a loud failure — never a silent short read.
    providerCalled = true;
    const { markdown, pages, chunks } = await ocrPdfComplete(bytes, request.signal);

    await settleOk(hold, ocrCost(pages));
    settled = true;

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
  } finally {
    // Release ONLY if the provider was never reached. Once a call is made we
    // may already have been billed for it — a multi-page OCR that fails
    // part-way still pays for the pages it processed — so a failure after
    // that point keeps the pessimistic reservation. Under-spending is the
    // safe direction for a cap; releasing here would let repeated failures
    // spend without ever being counted.
    if (hold && !settled && !providerCalled) await settleFailed(hold);
  }
}
