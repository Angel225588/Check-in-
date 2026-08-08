import { describe, it, expect } from "vitest";
import { serviceStamp } from "@/lib/mock-seeder";

/**
 * The demo day has to keep the same clock as the desk.
 *
 * Two failures, one cause: the seeder wrote `${date}T08:30:00.000Z`. The Z is
 * UTC, and reception is in Paris — so a breakfast seeded for 08:30 read
 * **10:30** on the tablet, and Récents looked like a lunch service.
 *
 * The second failure is the one that would have hurt tomorrow morning. A mock
 * arrival stamped ahead of the current clock sorts ABOVE every real check-in,
 * newest-first — so at 07:00 during service, the room you just entered would
 * sit under a pile of guests who "arrived" at 13:00 and had not arrived at all.
 * The one thing reception asks Récents is "did I already do 224?", and it would
 * have been answering with fiction.
 *
 * So: local time, and never later than now.
 */
describe("serviceStamp", () => {
  const day = new Date(2026, 7, 7, 21, 10); // 07/08/2026 21:10 local

  it("stamps local time, not UTC", () => {
    const iso = serviceStamp("2026-08-07", 8, 30, day);
    const back = new Date(iso);
    expect(back.getHours()).toBe(8);
    expect(back.getMinutes()).toBe(30);
  });

  it("never lands in the future", () => {
    // Seeded at 07:00 for a breakfast "at 09:40": the day has not got there.
    const now = new Date(2026, 7, 7, 7, 0);
    const iso = serviceStamp("2026-08-07", 9, 40, now);
    expect(new Date(iso).getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("keeps the real time when the day has already passed it", () => {
    const iso = serviceStamp("2026-08-07", 8, 30, day);
    expect(new Date(iso).getHours()).toBe(8);
  });

  it("leaves a past date alone — yesterday's 08:30 is 08:30", () => {
    const iso = serviceStamp("2026-08-06", 8, 30, day);
    const back = new Date(iso);
    expect(back.getDate()).toBe(6);
    expect(back.getHours()).toBe(8);
  });

  it("a real check-in made now sorts above every seeded one", () => {
    const now = new Date(2026, 7, 7, 7, 0);
    const seeded = ["2026-08-07"].flatMap(() =>
      [[6, 40], [8, 30], [9, 40], [10, 55]].map(([h, m]) => serviceStamp("2026-08-07", h, m, now))
    );
    const mine = now.toISOString();
    const newest = [...seeded, mine].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )[0];
    expect(newest).toBe(mine);
  });
});
