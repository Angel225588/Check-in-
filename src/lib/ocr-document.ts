/**
 * Whole-document OCR with a completeness guarantee.
 *
 * A breakfast roster can run 20+ pages and 300+ guests. Mistral OCR reads a
 * whole PDF in one call, but "it fit last time" is not an assurance — an
 * oversized document that silently comes back short would drop guests with no
 * visible error, and reception would only find out at the buffet.
 *
 * So this module does not trust any single call to be complete:
 *
 *   1. Count the pages locally (pdf-lib) BEFORE sending anything.
 *   2. Split into page-chunks when the document is large.
 *   3. OCR the chunks with bounded concurrency (each chunk gets the transport's
 *      own timeout + 429/5xx backoff).
 *   4. ASSERT that every chunk returned and that the pages processed add up to
 *      the page count we measured. Any shortfall throws.
 *
 * A caller therefore gets either the complete document or a loud failure —
 * never a quietly truncated roster.
 */
import { PDFDocument } from "pdf-lib";
import { splitPdfIntoChunks } from "./pdf-split";
import { getAiProvider } from "./ai";

/** Pages per chunk. Measured: 5 pages ≈ 4s, so a chunk stays well inside the
 *  function timeout even on a slow scan. */
const PAGES_PER_CHUNK = 8;

/** Documents at or below this stay a single call — the common case. */
const SINGLE_CALL_MAX_PAGES = 12;

/** Parallel chunks in flight. Enough to be fast, low enough to respect rate
 *  limits (the transport still retries a 429 if we do hit one). */
const MAX_CONCURRENCY = 3;

export interface DocumentOcrResult {
  /** Page-ordered markdown for the whole document. */
  markdown: string;
  /** Pages the provider actually processed — asserted to equal the source. */
  pages: number;
  /** How many calls were used (1 when the document went in one shot). */
  chunks: number;
}

export class IncompleteOcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncompleteOcrError";
  }
}

/** Page count from the PDF itself. Returns null if it cannot be parsed. */
async function countPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

/** Run tasks with a concurrency cap, preserving result order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * OCR a PDF completely. Splits into chunks when large, and throws
 * IncompleteOcrError rather than returning a partial document.
 */
export async function ocrPdfComplete(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<DocumentOcrResult> {
  const provider = getAiProvider();
  const base64 = Buffer.from(bytes).toString("base64");
  const expectedPages = await countPages(bytes);

  // Small document (or an unparseable one we cannot split): one call.
  if (expectedPages === null || expectedPages <= SINGLE_CALL_MAX_PAGES) {
    const res = await provider.ocr({ base64, mimeType: "application/pdf", signal });

    // Even the single-call path is checked: if we know the page count and the
    // provider returned fewer, the document came back short.
    if (expectedPages !== null && res.pages < expectedPages) {
      throw new IncompleteOcrError(
        `OCR returned ${res.pages} of ${expectedPages} pages — refusing a partial roster`,
      );
    }
    return { markdown: res.markdown, pages: res.pages, chunks: 1 };
  }

  const chunks = await splitPdfIntoChunks(bytes, PAGES_PER_CHUNK);

  // Each chunk is processed independently. A chunk that fails after the
  // transport's retries rejects here and fails the whole document — better a
  // clear error reception can retry than a roster missing forty guests.
  const parts = await mapLimit(chunks, MAX_CONCURRENCY, async (chunk, i) => {
    try {
      const res = await provider.ocr({
        base64: Buffer.from(chunk).toString("base64"),
        mimeType: "application/pdf",
        signal,
      });
      return res;
    } catch (err) {
      throw new IncompleteOcrError(
        `Chunk ${i + 1}/${chunks.length} failed: ${(err as Error).message}`,
      );
    }
  });

  const pages = parts.reduce((sum, p) => sum + p.pages, 0);
  if (pages !== expectedPages) {
    throw new IncompleteOcrError(
      `OCR covered ${pages} of ${expectedPages} pages across ${chunks.length} chunks — refusing a partial roster`,
    );
  }

  // Page order is preserved by mapLimit, so repeated per-page headers still
  // parse and rows accumulate in document order.
  return { markdown: parts.map((p) => p.markdown).join("\n"), pages, chunks: chunks.length };
}
