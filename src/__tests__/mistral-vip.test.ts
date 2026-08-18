import { describe, it, expect } from "vitest";
import { detectDocType, parseMistralVip } from "@/lib/mistral-parser";

// Real Mistral OCR output shape of the Courtyard "VIP GUEST LIST".
const VIP_MD = `# COURTYARD BY MARRIOTT - VIP GUEST LIST
Date: 11/03/2026 Property: CTPAR Confidential
Total VIPs: 10 Report Generated: 11/03/26 05:30
|  Room | Guest Name | VIP Level | Notes / Special Instructions  |
| --- | --- | --- | --- |
|  105 | RODRIGUEZ, CARLOS | P6 | Marriott Bonvoy Titanium, Welcome amenity  |
|  230 | LEE, HYUN-AE | P5 | Bonvoy Platinum, Anniversary stay  |
- Confidential -`;

// The breakfast/arrival list (different table — no VIP Level column).
const CLIENT_MD = `# DAILY ARRIVAL REPORT
|  Room | Type | RTC | Confirmation | Name | Arrival | Depart | Status | Ad | Ch | Rate | Packs  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  101 | DLXK |  | HK-1 | DUPONT, JEAN | 11/03/26 | 14/03/26 | DKIN | 2 | 1 | BAR | BKF INC  |`;

describe("Mistral doc-type detection + VIP parsing", () => {
  it("detects a VIP guest list", () => {
    expect(detectDocType(VIP_MD)).toBe("vip");
  });

  it("detects a breakfast/arrival list as clients", () => {
    expect(detectDocType(CLIENT_MD)).toBe("clients");
  });

  it("detects a morning brief (special events) as brief", () => {
    expect(detectDocType("# BRIEFING DU MATIN\nEVENEMENTS SPECIAUX\nAnniversaire ch 210")).toBe("brief");
  });

  it("detects a no-post (no room charge) list as nopost", () => {
    expect(detectDocType("# NO POST LIST\nRoom charge not allowed for the following rooms")).toBe("nopost");
  });

  it("parses VIP rows with level + notes mapped to rooms", () => {
    const v = parseMistralVip(VIP_MD);
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ roomNumber: "105", name: "RODRIGUEZ, CARLOS", vipLevel: "P6", isVip: true });
    expect(v[0].vipNotes).toContain("Bonvoy Titanium");
    expect(v[1]).toMatchObject({ roomNumber: "230", name: "LEE, HYUN-AE", vipLevel: "P5" });
  });

  it("tags VIP rows as list_only (→ Hors-liste until matched to a room)", () => {
    expect(parseMistralVip(VIP_MD)[0].vipSource).toBe("list_only");
  });
});
