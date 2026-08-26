import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdfIntoChunks } from "@/lib/pdf-split";
import { dedupClients, dedupPackageRows } from "@/lib/ocr-helpers";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("splitPdfIntoChunks", () => {
  it("splits a 15-page PDF into 3 chunks of 5 (the R118 case)", async () => {
    const chunks = await splitPdfIntoChunks(await makePdf(15), 5);
    expect(chunks).toHaveLength(3);
    for (const c of chunks) expect(await pageCount(c)).toBe(5);
  });

  it("keeps a small PDF as a single chunk", async () => {
    const chunks = await splitPdfIntoChunks(await makePdf(3), 5);
    expect(chunks).toHaveLength(1);
    expect(await pageCount(chunks[0])).toBe(3);
  });

  it("handles a trailing remainder page", async () => {
    const chunks = await splitPdfIntoChunks(await makePdf(12), 5);
    expect(chunks).toHaveLength(3); // 5 + 5 + 2
    expect(await pageCount(chunks[2])).toBe(2);
  });

  it("does not lose any pages across chunks", async () => {
    const chunks = await splitPdfIntoChunks(await makePdf(23), 5);
    const totalPages = (
      await Promise.all(chunks.map((c) => pageCount(c)))
    ).reduce((a, b) => a + b, 0);
    expect(totalPages).toBe(23);
  });

  it("rejects a non-PDF buffer (so the caller can fall back)", async () => {
    await expect(
      splitPdfIntoChunks(new TextEncoder().encode("not a pdf"), 5)
    ).rejects.toBeTruthy();
  });
});

describe("dedupClients (parallel-chunk merge)", () => {
  it("drops a guest duplicated across a chunk boundary", () => {
    const rows = [
      { roomNumber: "101", name: "Smith" },
      { roomNumber: "101", name: "Smith" }, // dup
      { roomNumber: "102", name: "Dupont" },
    ];
    expect(dedupClients(rows)).toHaveLength(2);
  });

  it("keeps two different guests in the same room (shared room)", () => {
    const rows = [
      { roomNumber: "101", name: "Smith" },
      { roomNumber: "101", name: "Smith Jr" },
    ];
    expect(dedupClients(rows)).toHaveLength(2);
  });

  it("preserves first-occurrence order", () => {
    const rows = [
      { roomNumber: "2", name: "B" },
      { roomNumber: "1", name: "A" },
      { roomNumber: "2", name: "B" },
    ];
    const out = dedupClients(rows);
    expect(out.map((r) => r.roomNumber)).toEqual(["2", "1"]);
  });
});

describe("dedupPackageRows", () => {
  it("keeps one package row per room", () => {
    const out = dedupPackageRows([
      { roomNumber: "101", packageCode: "BKF GRP" },
      { roomNumber: "101", packageCode: "BKF INC" },
      { roomNumber: "102", packageCode: "CITY TAX" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].packageCode).toBe("BKF GRP");
  });
});
