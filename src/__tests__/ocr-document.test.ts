/**
 * The completeness guarantee for long documents.
 *
 * A 20-page roster that silently comes back as 8 pages would drop ~200 guests
 * and reception would only discover it at the buffet. These tests pin the
 * behaviour that makes that impossible: count locally first, split when large,
 * and refuse to return anything that does not add up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ocrPdfComplete, IncompleteOcrError } from "@/lib/ocr-document";
import * as ai from "@/lib/ai";

/** Decode base64 to a plain Uint8Array (pdf-lib rejects a bare Buffer here). */
function toBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`page ${i + 1}`, { x: 40, y: 800 });
  return doc.save();
}

/** A provider that reports exactly the pages it was handed. */
function honestProvider() {
  const calls: number[] = [];
  const ocr = vi.fn(async ({ base64 }: { base64: string }) => {
    const doc = await PDFDocument.load(toBytes(base64), { ignoreEncryption: true });
    const n = doc.getPageCount();
    calls.push(n);
    return { markdown: `chunk(${n})`, pages: n };
  });
  return { calls, provider: { name: "mistral", ocr, extractJson: vi.fn() } };
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
});
afterEach(() => vi.restoreAllMocks());

describe("small documents", () => {
  it("goes in a single call", async () => {
    const { calls, provider } = honestProvider();
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    const res = await ocrPdfComplete(await makePdf(5));
    expect(res.chunks).toBe(1);
    expect(res.pages).toBe(5);
    expect(calls).toEqual([5]);
  });
});

describe("long documents", () => {
  it("splits a 25-page roster and covers every page", async () => {
    const { calls, provider } = honestProvider();
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    const res = await ocrPdfComplete(await makePdf(25));
    expect(res.chunks).toBeGreaterThan(1);
    // The guarantee: pages processed == pages in the source document.
    expect(res.pages).toBe(25);
    expect(calls.reduce((a, b) => a + b, 0)).toBe(25);
  });

  it("keeps chunks in page order so rows accumulate correctly", async () => {
    let n = 0;
    const provider = {
      name: "mistral",
      // Resolve later chunks FIRST — order must come from position, not timing.
      ocr: vi.fn(async ({ base64 }: { base64: string }) => {
        const doc = await PDFDocument.load(toBytes(base64), { ignoreEncryption: true });
        const id = n++;
        await new Promise((r) => setTimeout(r, id === 0 ? 30 : 1));
        return { markdown: `#${id}`, pages: doc.getPageCount() };
      }),
      extractJson: vi.fn(),
    };
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    const res = await ocrPdfComplete(await makePdf(24));
    expect(res.markdown.split("\n")).toEqual(["#0", "#1", "#2"]);
  });
});

describe("refusing partial results", () => {
  it("throws when a chunk comes back short instead of returning a partial roster", async () => {
    const provider = {
      name: "mistral",
      ocr: vi.fn(async () => ({ markdown: "partial", pages: 1 })), // always under-reports
      extractJson: vi.fn(),
    };
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    await expect(ocrPdfComplete(await makePdf(25))).rejects.toBeInstanceOf(IncompleteOcrError);
  });

  it("throws when a single-call document comes back short", async () => {
    const provider = {
      name: "mistral",
      ocr: vi.fn(async () => ({ markdown: "half", pages: 2 })),
      extractJson: vi.fn(),
    };
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    await expect(ocrPdfComplete(await makePdf(6))).rejects.toThrow(/2 of 6 pages/);
  });

  it("fails the whole document when one chunk errors — never a silent gap", async () => {
    let call = 0;
    const provider = {
      name: "mistral",
      ocr: vi.fn(async ({ base64 }: { base64: string }) => {
        const doc = await PDFDocument.load(toBytes(base64), { ignoreEncryption: true });
        if (call++ === 1) throw new Error("upstream exploded");
        return { markdown: "ok", pages: doc.getPageCount() };
      }),
      extractJson: vi.fn(),
    };
    vi.spyOn(ai, "getAiProvider").mockReturnValue(provider as unknown as ai.AiProvider);

    await expect(ocrPdfComplete(await makePdf(25))).rejects.toBeInstanceOf(IncompleteOcrError);
  });
});
