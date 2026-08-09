import { describe, it, expect, beforeEach } from "vitest";
import { seedMockData } from "@/lib/mock-seeder";
import { groupBlocks } from "@/lib/groups";
import { needsPaymentChoice } from "@/lib/utils";
import type { Client } from "@/lib/types";

/**
 * The demo data is what Angel tests on, so anything the app can show has to be
 * present in it. Every case below is a feature that looked broken on the iPad
 * purely because the seeded day could not exercise it: dates were empty
 * strings, every BKF GRP room shared a blank rate code and a blank stay window
 * so they collapsed into one meaningless "group", and there was no obvious VIP
 * to try the points swap on.
 */
function today(): { clients: Client[]; checkIns: { roomNumber: string }[] } {
  const key = "dailyData_" + new Date().toISOString().split("T")[0];
  return JSON.parse(localStorage.getItem(key) || '{"clients":[],"checkIns":[]}');
}

describe("the demo day can exercise the app", () => {
  beforeEach(() => {
    localStorage.clear();
    seedMockData();
  });

  it("gives every room an arrival and a departure date", () => {
    const { clients } = today();
    expect(clients.length).toBeGreaterThan(0);
    const dated = clients.filter((c) => /^\d{2}\/\d{2}\/\d{2}$/.test(c.arrivalDate)
      && /^\d{2}\/\d{2}\/\d{2}$/.test(c.departureDate));
    expect(dated.length).toBe(clients.length);
  });

  it("never departs before it arrives", () => {
    const ord = (d: string) => d.split("/").reverse().join("");
    for (const c of today().clients) {
      expect(ord(c.departureDate) > ord(c.arrivalDate)).toBe(true);
    }
  });

  it("contains real group blocks, not one blob of every BKF GRP room", () => {
    const blocks = groupBlocks(today().clients);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    // A tour is several rooms travelling together, not the whole hotel.
    for (const b of blocks) {
      expect(b.rooms).toBeGreaterThan(1);
      expect(b.rateCode).not.toBe("");
    }
  });

  it("has at least one group leaving today, so the DÉPART badge can be seen", () => {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const todayShort = `${p(now.getDate())}/${p(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}`;
    const blocks = groupBlocks(today().clients);
    expect(blocks.some((b) => b.departureDate === todayShort)).toBe(true);
  });

  it("has a VIP with no breakfast, so the points swap has somewhere to appear", () => {
    const { clients } = today();
    expect(clients.some((c) => c.isVip && needsPaymentChoice(c))).toBe(true);
  });

  it("has rooms with children, so the Enfants tile is not always hidden", () => {
    expect(today().clients.some((c) => c.children > 0)).toBe(true);
  });

  /**
   * US-2 is the story that protects the money: a room whose breakfast is not
   * covered must refuse the one-tap commit and make reception choose. The story
   * pass could not check it on some runs — "no such room in the day" — because
   * the package code was drawn at random and an ordinary guest with no
   * breakfast package is only one weight in nine.
   *
   * A probe that silently skips its subject is worse than a red one: it reports
   * 32/33 and reads like a pass. The demo day guarantees the case now.
   */
  it("has an ordinary room that needs a payment decision, so US-2 can be tested", () => {
    // Every day, not one lucky day. The package code is drawn at random, so a
    // single seed proves nothing about the next morning Angel loads — and the
    // story pass fails on the mornings that come up short, not on the ones a
    // one-shot test would have sampled.
    const short: number[] = [];
    for (let run = 0; run < 40; run++) {
      localStorage.clear();
      seedMockData();
      const { clients, checkIns } = today();
      // STILL TO COME. The demo day arrives mid-service with most rooms already
      // entered — 81 of 98 on the run that failed — so "the day contains such a
      // room" is not the precondition. The probe needs one nobody has checked
      // in yet, and that is the count that ran out.
      const done = new Set(checkIns.map((c) => c.roomNumber));
      const testable = clients.filter(
        (c) =>
          !done.has(c.roomNumber) &&
          needsPaymentChoice(c) &&
          /^\d{3}$/.test(c.roomNumber) &&
          c.vipSource !== "list_only" &&
          c.vipSource !== "walk_in"
      );
      if (testable.length === 0) short.push(run);
    }
    expect(short, `days with no room left to decide: ${short.join(", ")}`).toEqual([]);
  });
});
