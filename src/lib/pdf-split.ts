import { PDFDocument } from "pdf-lib";

/**
 * Split a PDF into chunks of at most `pagesPerChunk` pages each, so each chunk
 * can be OCR'd by its own (parallel) Gemini call and finish well within the
 * serverless function timeout. A 15-page report split into 5-page chunks
 * becomes 3 short calls instead of one call that blows past 60s.
 *
 * Always returns at least one chunk. Throws if the PDF cannot be parsed
 * (callers should fall back to processing the whole file).
 */
export async function splitPdfIntoChunks(
  pdfBuffer: Uint8Array,
  pagesPerChunk: number
): Promise<Uint8Array[]> {
  const perChunk = Math.max(1, pagesPerChunk);
  const src = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const total = src.getPageCount();

  const chunks: Uint8Array[] = [];
  for (let start = 0; start < total; start += perChunk) {
    const doc = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = start; p < Math.min(start + perChunk, total); p++) {
      indices.push(p);
    }
    const copied = await doc.copyPages(src, indices);
    copied.forEach((page) => doc.addPage(page));
    chunks.push(await doc.save());
  }
  return chunks;
}
