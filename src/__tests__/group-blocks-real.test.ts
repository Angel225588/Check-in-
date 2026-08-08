import { describe, it, expect } from "vitest";
import { groupBlocks, MIN_BLOCK_ROOMS, MAX_BLOCK_NIGHTS } from "@/lib/groups";
import type { Client } from "@/lib/types";

/**
 * What counts as a group, on the hotel's real list.
 *
 * Angel, looking at his own morning: "I don't really have a group at the hotel"
 * — and the report showed **10 blocks**. Nothing was invented: the list marks
 * those rooms `BKF GRP`, and the app clustered them by rate code and stay
 * window exactly as designed. The design was wrong.
 *
 * Two things the old rule could not tell apart:
 *
 * - **Two rooms is not a coach.** A pair on the same rate arriving the same day
 *   is a couple, a family split over two rooms, two colleagues. Reporting it as
 *   a group makes "10 blocs" meaningless for staffing, which is the only reason
 *   the number exists.
 * - **26/06 → 24/08 is not a tour.** A two-month stay on a shared rate is a
 *   contract: crew, a long-stay corporate, a residence. It never arrives
 *   together and never leaves together, so it changes nothing about the peak.
 *
 * The name shown is the RATE CODE — `PV2G`, `ESPC`. The list has no group-name
 * column, so the app cannot know a tour's name and must not pretend to.
 */
const mk = (room: string, rate: string, arr: string, dep: string, pkg = "BKF GRP"): Client => ({
  roomNumber: room, roomType: "DLXK", rtc: "", confirmationNumber: "9" + room,
  name: `NOM${room}/X`, arrivalDate: arr, departureDate: dep,
  reservationStatus: "CKIN", adults: 2, children: 0, rateCode: rate, packageCode: pkg,
});

describe("groupBlocks, against the real list", () => {
  it("keeps a coach: several rooms, one short window", () => {
    const house = ["201", "202", "203", "204"].map((r) => mk(r, "TOMEU", "07/08/26", "09/08/26"));
    expect(groupBlocks(house)).toHaveLength(1);
    expect(groupBlocks(house)[0]).toMatchObject({ rateCode: "TOMEU", rooms: 4 });
  });

  it("drops a pair — two rooms on one rate is a couple, not a coach", () => {
    const house = ["301", "302"].map((r) => mk(r, "ESPC", "03/08/26", "10/08/26"));
    expect(groupBlocks(house)).toEqual([]);
  });

  it("drops a long stay — 26/06 to 24/08 is a contract, not a tour", () => {
    const house = ["401", "402", "403", "404"].map((r) => mk(r, "ESPC", "26/06/26", "24/08/26"));
    expect(groupBlocks(house)).toEqual([]);
  });

  it("keeps the thresholds honest and nameable", () => {
    expect(MIN_BLOCK_ROOMS).toBeGreaterThanOrEqual(3);
    expect(MAX_BLOCK_NIGHTS).toBeLessThanOrEqual(14);
  });

  it("Angel's morning: ten 'blocks' become the ones that are actually groups", () => {
    const house = [
      // Three short-stay clusters of three rooms — these behave like groups.
      ...["201", "202", "203"].map((r) => mk(r, "PV2G", "07/08/26", "09/08/26")),
      ...["211", "212", "213"].map((r) => mk(r, "PV2B", "07/08/26", "09/08/26")),
      ...["221", "222", "223"].map((r) => mk(r, "PV2A", "07/08/26", "09/08/26")),
      // Long-stay contract rooms sharing a rate — four separate "blocks" before.
      ...["301", "302"].map((r) => mk(r, "ESPC", "26/06/26", "24/08/26")),
      ...["311", "312"].map((r) => mk(r, "ESPC", "03/08/26", "10/08/26")),
      ...["321", "322"].map((r) => mk(r, "ESPC", "01/07/26", "24/08/26")),
      ...["331", "332"].map((r) => mk(r, "ESPC", "29/06/26", "24/08/26")),
    ];
    const blocks = groupBlocks(house);
    expect(blocks.map((b) => b.rateCode).sort()).toEqual(["PV2A", "PV2B", "PV2G"]);
  });

  it("an unreadable date never silently creates or kills a block", () => {
    // OCR misses a date more often than anyone would like. Unknown length must
    // not be treated as "short" — a block we cannot date is not a coach.
    const house = ["501", "502", "503"].map((r) => mk(r, "XX", "", ""));
    expect(groupBlocks(house)).toEqual([]);
  });
});
