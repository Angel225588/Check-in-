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
function today(): { clients: Client[] } {
  const key = "dailyData_" + new Date().toISOString().split("T")[0];
  return JSON.parse(localStorage.getItem(key) || '{"clients":[]}');
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
});
