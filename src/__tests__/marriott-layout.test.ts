/**
 * Regression locks for the REAL Courtyard export layouts.
 *
 * The fixtures reproduce the exact table structure Mistral OCR returns for the
 * hotel's own "Guest InHouse VIP" and "R118 Package Forecast" reports, with
 * guest names replaced — the layout is what broke us, not the data, and real
 * guest PII must never enter the repo.
 *
 * Every case here is a bug that actually shipped or nearly shipped:
 *  - the VIP header split across two rows → 0 VIPs parsed
 *  - the VIP code glued onto the name, or sitting in a trailing column
 *  - "Room Type" overwriting the real room number with a type code
 *  - Specials/Preferences rows silently dropped
 *  - the trailing summary table counted as four extra guests
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectDocType,
  parseMistralVip,
  parseMistralMarkdown,
  parseMistralPackageRows,
} from "@/lib/mistral-parser";

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const VIP = () => fixture("marriott-vip-layout.md");
const ROSTER = () => fixture("marriott-roster-layout.md");

describe("Courtyard 'Guest InHouse VIP' export", () => {
  it("is classified as a VIP list", () => {
    expect(detectDocType(VIP())).toBe("vip");
  });

  it("parses every guest despite the header being split over two rows", () => {
    // The bug: parseMistralVip needed VIP and Name in the SAME header row.
    // The real export puts "Room No. | Name | …" on one row and
    // "| VIP | Block Code | …" on the next, so nothing matched and the
    // session showed 0 VIPs.
    expect(parseMistralVip(VIP())).toHaveLength(6);
  });

  it("keeps the room number, never the room-type code", () => {
    // "Room Type" also classifies as a room column; the generic column loop
    // was overwriting room 708 with the type "JSHF".
    const rows = parseMistralVip(VIP());
    expect(rows.map((r) => r.roomNumber)).toEqual(["708", "608", "108", "509", "719", "551"]);
    expect(rows.every((r) => /^\d{2,5}$/.test(r.roomNumber))).toBe(true);
  });

  it("reads the VIP code whether it is glued to the name or in its own column", () => {
    const rows = parseMistralVip(VIP());
    // Glued: "ALVAREZ,MARIA X5" · trailing column: "| 25MRYC | X4 |"
    expect(rows.map((r) => r.vipLevel)).toEqual(["X5", "P6", "P6", "X4", "X4", "P6"]);
  });

  it("strips the code back off the name, leaving it exactly as printed", () => {
    const rows = parseMistralVip(VIP());
    expect(rows.map((r) => r.name)).toEqual([
      "ALVAREZ,MARIA", "BENOIT,CLAIRE", "CARTER,JOHN,Mr",
      "Dupont,Luc", "Esposito,Mia,Mr", "FONTAINE,ANNE",
    ]);
  });

  it("attaches Specials/Preferences rows to the guest above them", () => {
    // These rows carry the notes reception acts on at breakfast; they sit in
    // the first column where a room number would be.
    const first = parseMistralVip(VIP())[0];
    expect(first.vipNotes).toContain("Mobile Check-In (X2)");
    expect(first.vipNotes).toContain("High Floor Room (H1)");
  });

  it("tags rows so an unmatched VIP lands in Hors-liste", () => {
    expect(parseMistralVip(VIP()).every((r) => r.isVip && r.vipSource === "list_only")).toBe(true);
  });
});

describe("Courtyard 'R118 Package Forecast' export", () => {
  it("is classified as a roster", () => {
    expect(detectDocType(ROSTER())).toBe("clients");
  });

  it("does not count the trailing summary table as guests", () => {
    // The report ends with "Date | BKF INC … Totals | 34". Those rows were
    // parsed as four phantom guests, inflating the covers count.
    const rows = parseMistralMarkdown(ROSTER());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.roomNumber)).toEqual(["108", "109", "111"]);
    expect(rows.every((r) => /^\d{2,5}[A-Za-z]?$/.test(r.roomNumber))).toBe(true);
  });

  it("keeps the full Package Codes cell (breakfast detection depends on it)", () => {
    expect(parseMistralMarkdown(ROSTER())[0].packageCode).toBe("BKF COMP");
  });

  it("collects nameless room+package rows separately", () => {
    const pkg = parseMistralPackageRows(ROSTER());
    expect(pkg).toEqual([{ roomNumber: "204", packageCode: "CITY TAX,BKF GRP" }]);
  });
});
