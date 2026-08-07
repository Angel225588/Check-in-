import { describe, it, expect } from "vitest";
import { boxRows, boxRecord, boxCount } from "@/lib/box-list";
import type { Client, CheckInRecord } from "@/lib/types";

/**
 * US-34 — the coach leaves before the restaurant opens.
 *
 * A tour with a 06:45 departure does not eat: it collects paper bags at the
 * desk, one run, forty rooms, three minutes. Reception's job in those three
 * minutes is to tick rooms off a list and know instantly which one has not
 * come — not to type a room number, wait for a card, press a green button and
 * start again.
 *
 * A box IS breakfast. It counts as served, or the morning's figure is short by
 * a coach and the kitchen's numbers stop meaning anything. What it is not is a
 * payment: `viaBox` sits beside the payment, never instead of it.
 */
const c = (room: string, name: string, adults = 2, rate = "TOMEU"): Client => ({
  roomNumber: room, roomType: "DLXK", rtc: "", confirmationNumber: "9" + room,
  name, arrivalDate: "04/08/26", departureDate: "07/08/26",
  reservationStatus: "CKIN", adults, children: 0, rateCode: rate, packageCode: "BKF GRP",
});

/* The real client name, not a placeholder: a check-in is matched on room AND
   name, because two names in one room are two entries. A fixture that cannot
   reproduce that is a fixture that lies about the product. */
const ci = (room: string, name: string, n: number, viaBox = false): CheckInRecord => ({
  id: "ci" + room + (viaBox ? "b" : ""), roomNumber: room, clientName: name,
  peopleEntered: n, timestamp: new Date(2026, 7, 7, 6, 40).toISOString(),
  ...(viaBox ? { viaBox: true } : {}),
});

const HOUSE = [c("201", "MEUNIER/A"), c("202", "MEUNIER/B"), c("203", "MEUNIER/C", 3)];

describe("boxRows", () => {
  it("gives one line per room, in room order", () => {
    // Room order, not arrival order: the list is read against a paper manifest
    // and a coach's rooms are consecutive. Sorting by "who came first" would
    // reshuffle the list under the finger with every tick.
    expect(boxRows(HOUSE, []).map((r) => r.roomNumber)).toEqual(["201", "202", "203"]);
  });

  it("carries how many the room is due", () => {
    expect(boxRows(HOUSE, [])[2]).toMatchObject({ roomNumber: "203", due: 3, taken: 0, done: false });
  });

  it("marks a room done once its boxes are out", () => {
    const rows = boxRows(HOUSE, [ci("201", "MEUNIER/A", 2, true)]);
    expect(rows[0]).toMatchObject({ taken: 2, done: true });
    expect(rows[1].done).toBe(false);
  });

  it("counts a partial room as started, not done", () => {
    const rows = boxRows(HOUSE, [ci("203", "MEUNIER/C", 1, true)]);
    expect(rows[2]).toMatchObject({ taken: 1, due: 3, done: false });
  });

  it("counts someone who ate in the restaurant as served too", () => {
    // They had breakfast. Which door it came through is the report's business,
    // not this list's — showing them as still owed a box would send reception
    // chasing a guest who is sitting down eating.
    const rows = boxRows(HOUSE, [ci("202", "MEUNIER/B", 2)]);
    expect(rows[1]).toMatchObject({ taken: 2, done: true, viaBox: false });
  });

  it("remembers which ones were boxes", () => {
    const rows = boxRows(HOUSE, [ci("201", "MEUNIER/A", 2, true)]);
    expect(rows[0].viaBox).toBe(true);
  });
});

describe("boxRecord", () => {
  it("records the whole room at once — that is the gesture", () => {
    const rec = boxRecord(HOUSE[2], [], "id-1");
    expect(rec).toMatchObject({ roomNumber: "203", peopleEntered: 3, viaBox: true });
  });

  it("only the ones still owed, when some already came down", () => {
    const rec = boxRecord(HOUSE[2], [ci("203", "MEUNIER/C", 1)], "id-2");
    expect(rec!.peopleEntered).toBe(2);
  });

  it("refuses a room that owes nothing — no double count", () => {
    expect(boxRecord(HOUSE[0], [ci("201", "MEUNIER/A", 2)], "id-3")).toBeNull();
  });

  it("is a box, not a payment", () => {
    const rec = boxRecord(HOUSE[0], [], "id-4")!;
    expect(rec.viaBox).toBe(true);
    expect(rec.paymentAction).toBeUndefined();
  });
});

describe("boxCount", () => {
  it("says how many rooms are still owed a box", () => {
    expect(boxCount(boxRows(HOUSE, [ci("201", "MEUNIER/A", 2, true)]))).toEqual({ done: 1, of: 3 });
  });
});

describe("the report can tell a bag from a cover (US-34)", () => {
  it("marks the row when the breakfast left in a paper bag", async () => {
    const { buildArrivalRows } = await import("@/lib/report-v2");
    const report = {
      date: "2026-08-07",
      checkIns: [ci("201", "MEUNIER/A", 2, true), ci("202", "MEUNIER/B", 2)],
      rooms: [
        { roomNumber: "201", name: "MEUNIER/A", status: "complete", entered: 2, totalGuests: 2,
          adults: 2, extras: 0, isVip: false, vipLevel: "", isComp: false, hasBreakfast: true },
        { roomNumber: "202", name: "MEUNIER/B", status: "complete", entered: 2, totalGuests: 2,
          adults: 2, extras: 0, isVip: false, vipLevel: "", isComp: false, hasBreakfast: true },
      ],
    } as never;
    const rows = buildArrivalRows(report);
    // 40 bags and 40 covers are not the same morning for the kitchen, and the
    // 15:00 briefing is where that difference is read.
    expect(rows.find((r) => r.roomNumber === "201")!.box).toBe(true);
    expect(rows.find((r) => r.roomNumber === "202")!.box).toBe(false);
  });
});
