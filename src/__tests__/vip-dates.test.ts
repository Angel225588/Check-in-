import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseMistralVip, parseMistralMarkdown, detectDocType } from "@/lib/mistral-parser";
import { mergeVipIntoClients } from "@/lib/vip";
import type { Client, VipEntry } from "@/lib/types";

/**
 * The morning of 20/08/26 at the Courtyard Porte de Versailles, from the two
 * PDFs reception actually uploaded: "Guest InHouse VIP" and the R118 package
 * forecast. Guest data verbatim from those files, laid out in the markdown
 * table shape Mistral OCR emits (the shape `marriott-vip-layout.md` already
 * models). The row alignment is not eyeballed — it reproduces the VIP report's
 * own totals line, "Total Rooms 14  Total 21 0".
 *
 * Reception's report: room 451 showed no arrival and no departure, while the
 * PDF plainly had both.
 */
const fixture = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const VIP = () => fixture("vip-inhouse-2008.md");
const VIP_FUSED = () => fixture("vip-inhouse-2008-fused.md");
const ROSTER = () => fixture("roster-r118-2008.md");

const byRoom = (list: Client[], room: string) => list.find((c) => c.roomNumber === room);

const toVipEntries = (vips: Client[]): VipEntry[] =>
  vips.map((c) => ({
    roomNumber: c.roomNumber,
    name: c.name,
    vipLevel: c.vipLevel || "",
    vipNotes: c.vipNotes || "",
    confirmationNumber: c.confirmationNumber,
    arrivalDate: c.arrivalDate,
    departureDate: c.departureDate,
    roomType: c.roomType,
    adults: c.adults,
    children: c.children,
    rateCode: c.rateCode,
  }));

/**
 * The root cause. `VipField` listed only room, name, level and notes, so
 * `classifyVipHeader` could not return a date if it wanted to — every VIP row
 * was built from `emptyClient()` and kept its empty strings. The comment above
 * the column loop claimed "notes, dates still map through"; the type made that
 * impossible.
 */
describe("the VIP list carries dates, and they must survive the parse", () => {
  it("still recognises the document", () => {
    expect(detectDocType(VIP())).toBe("vip");
  });

  it("reads every one of the 14 VIP rooms", () => {
    expect(parseMistralVip(VIP())).toHaveLength(14);
  });

  it("gives room 451 the dates printed on the page", () => {
    const shen = byRoom(parseMistralVip(VIP()), "451");
    expect(shen).toBeDefined();
    expect(shen!.arrivalDate).toBe("17/08/26");
    expect(shen!.departureDate).toBe("21/08/26");
  });

  it("leaves no VIP row without an arrival and a departure", () => {
    const blanks = parseMistralVip(VIP())
      .filter((c) => !c.arrivalDate || !c.departureDate)
      .map((c) => c.roomNumber);
    expect(blanks).toEqual([]);
  });

  it("matches the printed dates for all 14 rooms", () => {
    const got = Object.fromEntries(
      parseMistralVip(VIP()).map((c) => [c.roomNumber, `${c.arrivalDate}→${c.departureDate}`])
    );
    expect(got).toEqual({
      "151": "18/08/26→23/08/26",
      "251": "15/08/26→29/08/26",
      "357": "19/08/26→20/08/26",
      "359": "19/08/26→20/08/26",
      "408": "14/08/26→23/08/26",
      "451": "17/08/26→21/08/26",
      "522": "16/07/26→24/08/26",
      "528": "17/08/26→21/08/26",
      "551": "16/08/26→21/08/26",
      "608": "15/08/26→24/08/26",
      "609": "13/08/26→22/08/26",
      "658": "03/08/26→24/08/26",
      "665": "16/08/26→23/08/26",
      "708": "19/08/26→20/08/26",
    });
  });

  it("picks up the room type from the same table", () => {
    expect(byRoom(parseMistralVip(VIP()), "451")!.roomType).toBe("EXST");
  });

  it("does not mistake the room-type column for the room number", () => {
    const rooms = parseMistralVip(VIP()).map((c) => c.roomNumber);
    expect(rooms).toContain("451");
    expect(rooms).not.toContain("EXST");
  });

  it("still reads the level and the notes it always read", () => {
    const shen = byRoom(parseMistralVip(VIP()), "451")!;
    expect(shen.vipLevel).toBe("X4");
    expect(shen.vipNotes).toContain("Member Rate (M5)");
    expect(shen.name).toBe("SHEN,JIA,Mrs");
  });
});

/**
 * In the PDF's own text layer the three columns touch: arrival, departure and
 * room type come out as one unbroken token, "17/08/2621/08/26EXST". Mistral
 * reads the rendered page rather than that layer, so it may well separate
 * them — but a parser that only works if the OCR is kind is not a fix.
 */
describe("when the columns are printed touching", () => {
  it("splits a fused arrival+departure+type into its three parts", () => {
    const shen = byRoom(parseMistralVip(VIP_FUSED()), "451")!;
    expect(shen.arrivalDate).toBe("17/08/26");
    expect(shen.departureDate).toBe("21/08/26");
    expect(shen.roomType).toBe("EXST");
  });

  it("handles every fused row, not just the one", () => {
    const got = parseMistralVip(VIP_FUSED()).map(
      (c) => `${c.roomNumber} ${c.arrivalDate}→${c.departureDate} ${c.roomType}`
    );
    expect(got).toEqual([
      "151 18/08/26→23/08/26 EXST",
      "451 17/08/26→21/08/26 EXST",
      "708 19/08/26→20/08/26 JSHF",
    ]);
  });
});

/**
 * The second defect, and the reason only ONE room looked broken.
 *
 * A VIP who is also on the breakfast roster takes the `existing` branch of
 * `mergeVipIntoClients`, which copied three fields — isVip, level, notes — and
 * nothing else. Thirteen of the fourteen looked fine only because the roster
 * had already supplied their dates. Room 451 is not on the roster at all
 * (breakfast non inclus), so it fell to the other branch with nothing to
 * inherit.
 */
describe("a VIP who is not on the breakfast roster", () => {
  it("is the only one of the fourteen missing from the roster", () => {
    const roster = parseMistralMarkdown(ROSTER());
    const vipRooms = parseMistralVip(VIP()).map((c) => c.roomNumber);
    const absent = vipRooms.filter((r) => !roster.some((c) => c.roomNumber === r));
    expect(absent).toEqual(["451"]);
  });

  it("arrives on the day's list with the dates from the VIP sheet", () => {
    const merged = mergeVipIntoClients(
      parseMistralMarkdown(ROSTER()),
      toVipEntries(parseMistralVip(VIP()))
    );
    const shen = byRoom(merged, "451");
    expect(shen).toBeDefined();
    expect(shen!.arrivalDate).toBe("17/08/26");
    expect(shen!.departureDate).toBe("21/08/26");
    expect(shen!.isVip).toBe(true);
    expect(shen!.vipSource).toBe("list_only");
  });

  it("leaves no room on the merged day without its dates", () => {
    const merged = mergeVipIntoClients(
      parseMistralMarkdown(ROSTER()),
      toVipEntries(parseMistralVip(VIP()))
    );
    const blanks = merged.filter((c) => !c.arrivalDate || !c.departureDate).map((c) => c.roomNumber);
    expect(blanks).toEqual([]);
  });
});

/**
 * The latent half of the same bug: a matched VIP never had dates copied onto
 * them either. It never showed, because the roster always happened to carry
 * them — until an OCR pass drops one column on one row.
 */
describe("backfilling a matched VIP", () => {
  const roster = (over: Partial<Client> = {}): Client[] => [
    {
      roomNumber: "151", roomType: "", rtc: "", confirmationNumber: "178198240",
      name: "WU, TUNG-AN", arrivalDate: "", departureDate: "", reservationStatus: "CKIN",
      adults: 2, children: 0, rateCode: "25MRYA", packageCode: "BKF COMP", ...over,
    },
  ];
  const vip: VipEntry[] = [{
    roomNumber: "151", name: "WU,TUNG-AN", vipLevel: "P6", vipNotes: "",
    confirmationNumber: "99259007", arrivalDate: "18/08/26", departureDate: "23/08/26",
    roomType: "EXST", adults: 2, children: 0, rateCode: "25MRYA",
  }];

  it("fills dates the roster row was missing", () => {
    const [c] = mergeVipIntoClients(roster(), vip);
    expect(c.arrivalDate).toBe("18/08/26");
    expect(c.departureDate).toBe("23/08/26");
    expect(c.isVip).toBe(true);
  });

  it("fills a missing room type", () => {
    expect(mergeVipIntoClients(roster(), vip)[0].roomType).toBe("EXST");
  });

  it("never overwrites what the roster already knows", () => {
    // The roster is the operational document for the morning. If the two
    // disagree, the desk works from the roster — backfill, never overwrite.
    const [c] = mergeVipIntoClients(
      roster({ arrivalDate: "01/01/26", departureDate: "02/01/26", roomType: "STKG" }),
      vip
    );
    expect(c.arrivalDate).toBe("01/01/26");
    expect(c.departureDate).toBe("02/01/26");
    expect(c.roomType).toBe("STKG");
  });

  it("still does the three things it always did", () => {
    const [c] = mergeVipIntoClients(roster(), [{ ...vip[0], vipNotes: "Late check-out" }]);
    expect(c.isVip).toBe(true);
    expect(c.vipLevel).toBe("P6");
    expect(c.vipNotes).toBe("Late check-out");
  });

  it("does not invent dates when the VIP sheet has none either", () => {
    const [c] = mergeVipIntoClients(roster(), [{ ...vip[0], arrivalDate: "", departureDate: "" }]);
    expect(c.arrivalDate).toBe("");
    expect(c.departureDate).toBe("");
  });
});
