/**
 * VIP classification must survive the wording differences between real
 * Marriott exports. A missed classification is silent and expensive: the VIP
 * rows get parsed as ordinary guests, so the session shows "0 VIP" and nobody
 * is flagged at breakfast.
 */
import { describe, it, expect } from "vitest";
import { detectDocType, parseMistralVip } from "@/lib/mistral-parser";

const table = (header: string) => `# ${header}

| Room | Guest Name | VIP | Notes |
| --- | --- | --- | --- |
| 105 | RODRIGUEZ, CARLOS | P6 | Titanium |
| 106 | JOHNSON, EMMA R. | P4 | Gold |`;

describe("VIP document classification", () => {
  it("matches the title wordings we have seen in the wild", () => {
    for (const title of [
      "COURTYARD BY MARRIOTT - VIP GUEST LIST",
      "Guest InHouse VIP",
      "Guest In House VIP 100",
    ]) {
      expect(detectDocType(table(title))).toBe("vip");
    }
  });

  it("classifies on table structure even when the title says nothing about VIPs", () => {
    // The real failure mode: an export titled something we never anticipated.
    expect(detectDocType(table("RAPPORT DU JOUR"))).toBe("vip");
  });

  it("still parses the rows once classified", () => {
    const rows = parseMistralVip(table("Guest In House VIP 100"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ roomNumber: "105", name: "RODRIGUEZ, CARLOS", vipLevel: "P6", isVip: true });
  });

  it("does NOT misclassify a roster that merely mentions VIP in a note", () => {
    const roster = `# DAILY ARRIVAL REPORT

| Room | Type | Name | Arrival | Depart | Ad | Ch | Packs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 101 | DLXK | DUPONT, JEAN | 11/03/26 | 14/03/26 | 2 | 1 | BKF INC |
| 102 | STKG | MARTIN, SOPHIE — VIP arrival, greet at desk | 10/03/26 | 13/03/26 | 2 | 0 | BKF INC |`;
    expect(detectDocType(roster)).toBe("clients");
  });
});
