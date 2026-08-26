/**
 * Extraction parity + accuracy gate for the Gemini → Mistral migration.
 *
 * The reference side is NOT another model. It is the PDF's own text layer
 * (`pdftotext -layout`, committed as a fixture), so "correct" is a fact about
 * the document rather than an agreement between two AIs.
 *
 * Fixtures were captured on 2026-08-15:
 *   fixtures/client-ground-truth.txt  — pdftotext of test-pdfs/client-list.pdf
 *   fixtures/vip-ground-truth.txt     — pdftotext of test-pdfs/vip-list.pdf
 *   fixtures/mistral-client-list.md   — live Mistral OCR 4.1 output, same PDF
 *   fixtures/mistral-vip.md           — live Mistral OCR 4.1 output, same PDF
 *   fixtures/gemini-vip-golden.json   — live gemini-2.5-flash output, same doc
 *
 * The Gemini golden is retained deliberately: it is the evidence for why the
 * cutover happened, and it stops anyone "restoring parity" with the old
 * provider by regressing a room number.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMistralMarkdown, parseMistralVip, detectDocType } from "@/lib/mistral-parser";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

/** Ground truth from the PDF text layer — the fixed-width report columns. */
function groundTruthClients(): Array<{ roomNumber: string; name: string }> {
  const out: Array<{ roomNumber: string; name: string }> = [];
  for (const line of fixture("client-ground-truth.txt").split("\n")) {
    const m = line.match(/^(\d{3})\s+\S+\s+\S*\s*(HK-\d+)\s+(.+?)\s{2,}\d{2}\/\d{2}\/\d{2}/);
    if (m) out.push({ roomNumber: m[1], name: m[3].trim() });
  }
  return out;
}

function groundTruthVips(): Array<{ roomNumber: string; name: string; vipLevel: string }> {
  const out: Array<{ roomNumber: string; name: string; vipLevel: string }> = [];
  for (const line of fixture("vip-ground-truth.txt").split("\n")) {
    const m = line.match(/^(\d{3})\s{2,}(.+?)\s{2,}(P\d)\s{2,}/);
    if (m) out.push({ roomNumber: m[1], name: m[2].trim(), vipLevel: m[3] });
  }
  return out;
}

describe("extraction parity — Mistral OCR vs the document itself", () => {
  it("recovers every guest row, with every room number exact", () => {
    const truth = groundTruthClients();
    const parsed = parseMistralMarkdown(fixture("mistral-client-list.md"));

    // Guard the guard: if the fixture regex ever stops matching, this test
    // would trivially pass against an empty reference.
    expect(truth).toHaveLength(40);
    expect(parsed).toHaveLength(truth.length);

    // Room numbers must be 100% exact and in order. This is the join key for
    // check-in: a wrong room number silently charges the wrong guest, which is
    // the failure that made Gemini unacceptable.
    expect(parsed.map((c) => c.roomNumber)).toEqual(truth.map((t) => t.roomNumber));
  });

  /**
   * Known-OCR-drift lock.
   *
   * No OCR engine is character-perfect, so rather than assert a perfection
   * Mistral does not have, this pins the EXACT set of known name deviations on
   * this fixture. Any new name error fails the suite; fixing this one also
   * fails it, which forces the list to be updated deliberately.
   *
   * Recorded 2026-08-15 against mistral-ocr-4-1: 38/40 names exact (95%).
   * Both failures are first-letter glyph misreads of a surname:
   *   room 120  WANG → HANG   (W→H)
   *   room 127  PATEL → FATEL (P→F)
   * Other similar surnames in the same document (PETIT, PARK, FISCHER) were
   * read correctly, so this is glyph-level noise rather than a systematic
   * column fault. Mitigation in production is the /api/verify-extraction
   * route, which re-reads the document and reports corrections like these.
   */
  it("has no name drift beyond the recorded OCR deviations", () => {
    const truth = groundTruthClients();
    const parsed = parseMistralMarkdown(fixture("mistral-client-list.md"));

    const deviations = parsed
      .map((c, i) => ({ room: c.roomNumber, got: c.name, want: truth[i].name }))
      .filter((d) => d.got !== d.want);

    expect(deviations).toEqual([
      { room: "120", got: "HANG, XIAO MING", want: "WANG, XIAO MING" },
      { room: "127", got: "FATEL, RAVI KUMAR", want: "PATEL, RAVI KUMAR" },
    ]);

    // Accuracy floor, stated as a number so a regression is unmissable.
    const exact = parsed.length - deviations.length;
    expect(exact / parsed.length).toBeGreaterThanOrEqual(0.95);
  });

  it("preserves the downstream Client shape (nothing else may break)", () => {
    const [first] = parseMistralMarkdown(fixture("mistral-client-list.md"));
    expect(first).toMatchObject({
      roomNumber: "101",
      name: "DUPONT, JEAN-PIERRE",
      arrivalDate: "11/03/26",
      departureDate: "14/03/26",
      adults: 2,
      children: 1,
      rateCode: "BAR",
      packageCode: "BKF INC",
    });
    // Numeric fields stay numbers, not strings — the KPI math depends on it.
    expect(typeof first.adults).toBe("number");
    expect(typeof first.children).toBe("number");
  });

  it("classifies both documents correctly", () => {
    expect(detectDocType(fixture("mistral-client-list.md"))).toBe("clients");
    expect(detectDocType(fixture("mistral-vip.md"))).toBe("vip");
  });

  it("recovers every VIP row with the correct level", () => {
    const truth = groundTruthVips();
    const parsed = parseMistralVip(fixture("mistral-vip.md"));

    expect(truth).toHaveLength(10);
    expect(parsed).toHaveLength(truth.length);
    expect(
      parsed.map((c) => ({ roomNumber: c.roomNumber, name: c.name, vipLevel: c.vipLevel })),
    ).toEqual(truth);
  });

  it("tags VIP rows so an unmatched VIP lands in Hors-liste", () => {
    const parsed = parseMistralVip(fixture("mistral-vip.md"));
    expect(parsed.every((c) => c.isVip === true)).toBe(true);
    expect(parsed.every((c) => c.vipSource === "list_only")).toBe(true);
  });
});

describe("parity vs the Gemini output being replaced", () => {
  const truth = groundTruthVips();
  const gemini = JSON.parse(fixture("gemini-vip-golden.json")) as Array<{
    roomNumber: string;
    name: string;
    vipLevel: string;
  }>;
  const mistral = parseMistralVip(fixture("mistral-vip.md"));

  it("extracts the same number of VIP rows as Gemini did (no coverage lost)", () => {
    expect(mistral).toHaveLength(gemini.length);
  });

  it("agrees with Gemini on every row Gemini got right", () => {
    const truthByRoom = new Map(truth.map((t) => [t.roomNumber, t]));
    const mistralByRoom = new Map(mistral.map((m) => [m.roomNumber, m]));

    for (const g of gemini) {
      if (!truthByRoom.has(g.roomNumber)) continue; // Gemini invented this row
      expect(mistralByRoom.get(g.roomNumber)?.name).toBe(g.name);
    }
  });

  /**
   * Regression lock for the defect that justified the migration.
   *
   * On 2026-08-15 gemini-2.5-flash read room 106 "JOHNSON, EMMA R." as room
   * 104 "JOHNSON, EMMA H." — a corrupted room number and a corrupted initial
   * on a ten-row document. In this app a wrong room number bills the wrong
   * guest at breakfast, so this asserts Mistral does not reproduce it.
   */
  it("does not reproduce the Gemini room-number corruption (room 106)", () => {
    expect(truth.find((t) => t.roomNumber === "106")?.name).toBe("JOHNSON, EMMA R.");

    const geminiRooms = new Set(gemini.map((g) => g.roomNumber));
    expect(geminiRooms.has("104")).toBe(true); // the defect, as recorded
    expect(geminiRooms.has("106")).toBe(false);

    const mistralRooms = new Set(mistral.map((m) => m.roomNumber));
    expect(mistralRooms.has("106")).toBe(true);
    expect(mistralRooms.has("104")).toBe(false);
    expect(mistral.find((m) => m.roomNumber === "106")?.name).toBe("JOHNSON, EMMA R.");
  });

  it("matches ground truth on every room Gemini got wrong", () => {
    const truthRooms = truth.map((t) => t.roomNumber).sort();
    const geminiWrong = gemini
      .map((g) => g.roomNumber)
      .filter((r) => !truthRooms.includes(r));

    // Documents the recorded defect count; Mistral must have none of them.
    expect(geminiWrong).toEqual(["104"]);
    expect(mistral.map((m) => m.roomNumber).sort()).toEqual(truthRooms);
  });
});
