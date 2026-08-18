import { describe, it, expect } from "vitest";
import { parseMistralMarkdown } from "@/lib/mistral-parser";

// Synthetic Courtyard "Daily Arrival" format (headers: Room/Type/.../Ad/Ch/Rate/Packs)
const SYNTH = `# COURTYARD BY MARRIOTT - DAILY ARRIVAL REPORT
Date: 11/03/2026 Property: CYFAR Page 1/2
Total Rooms: 40 Total Adults: 69 Total Children: 20
|  Room | Type | RTC | Confirmation | Name | Arrival | Depart | Status | Ad | Ch | Rate | Packs  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  101 | DLXK |  | HK-892341 | DUPONT, JEAN-PIERRE | 11/03/26 | 14/03/26 | DKIN | 2 | 1 | BAR | BKF INC  |
|  103 | PRMK | W7 | HK-892343 | CHEN, WEI LING | 11/03/26 | 15/03/26 | DKIN | 1 | 0 | AAA | BKF GRP  |
- End of Page 1 -`;

// Real R118 Package Forecast format (headers: Room No./Room Type/.../Adl./Chl./Rate Code/Package Codes)
const REAL = `R118 Package Forecast - Detailed
|  Room No. | Room Type | RTC | Conf. No. | Name | Arrival Date | Departure Date | Resv. Status | Adl. | Chl. | Rate Code | Package Codes  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  567 | PRMK | DLXK | 176599332 | DIGLE, FABRICE, MICHEL | 20/02/26 | 01/03/26 | DUOT | 1 | 0 | CMXC | BKF GRP  |
|  651 | EXST | STKG | 177033255 | JU, DA | 28/02/26 | 01/03/26 | DUOT | 2 | 0 | 12RMOC | BKF COMP  |
Page 5 of 7`;

describe("parseMistralMarkdown", () => {
  it("parses the synthetic Courtyard arrival report (header-mapped)", () => {
    const c = parseMistralMarkdown(SYNTH);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({
      roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "HK-892341",
      name: "DUPONT, JEAN-PIERRE", arrivalDate: "11/03/26", departureDate: "14/03/26",
      reservationStatus: "DKIN", adults: 2, children: 1, rateCode: "BAR", packageCode: "BKF INC",
    });
    expect(c[1]).toMatchObject({ name: "CHEN, WEI LING", roomType: "PRMK", adults: 1, packageCode: "BKF GRP" });
  });

  it("parses the real R118 Package Forecast (different headers, same order)", () => {
    const c = parseMistralMarkdown(REAL);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({
      roomNumber: "567", roomType: "PRMK", rtc: "DLXK", confirmationNumber: "176599332",
      name: "DIGLE, FABRICE, MICHEL", adults: 1, children: 0, rateCode: "CMXC", packageCode: "BKF GRP",
    });
    expect(c[1]).toMatchObject({ name: "JU, DA", roomType: "EXST", adults: 2, packageCode: "BKF COMP" });
  });

  it("accumulates rows across multiple pages (repeated headers)", () => {
    const c = parseMistralMarkdown(SYNTH + "\n" + REAL);
    expect(c).toHaveLength(4);
    expect(c.map((x) => x.name)).toContain("JU, DA");
    expect(c.map((x) => x.name)).toContain("DUPONT, JEAN-PIERRE");
  });

  it("ignores non-table noise and returns [] for junk", () => {
    expect(parseMistralMarkdown("just some text\nno tables here")).toEqual([]);
    expect(parseMistralMarkdown("")).toEqual([]);
  });
});
