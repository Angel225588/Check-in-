import { describe, it, expect } from "vitest";
import { guestKey, arrivalMinutesByGuest, expectedSoon } from "@/lib/expected-soon";
import type { Client, SessionRecord } from "@/lib/types";

/**
 * "Attendus bientôt" said 07:15 for a guest whose own screen said 09:40.
 *
 * The pane was not predicting badly — it was not predicting at all. It printed
 * `07:${15 + i * 6}` from the row's position in the list, so the first guest on
 * screen was always due at 07:15 and the second always at 07:21, whoever they
 * were. Reception reads that pane to know who is still to come; a number that
 * comes from an array index is a lie told in a confident font.
 *
 * The times on both screens now come from this one module, so they cannot
 * disagree again.
 */

const client = (roomNumber: string, name: string): Client =>
  ({ roomNumber, name, adults: 1, children: 0 }) as unknown as Client;

/** A morning where these guests came down at these times. */
const morning = (date: string, at: Record<string, string>): SessionRecord =>
  ({
    date,
    clients: Object.keys(at).map((n, i) => client(String(100 + i), n)),
    checkIns: Object.entries(at).map(([name, hhmm], i) => ({
      id: `${date}-${i}`,
      roomNumber: String(100 + i),
      clientName: name,
      peopleEntered: 1,
      timestamp: `${date}T${hhmm}:00`,
    })),
  }) as unknown as SessionRecord;

const TODAY = "2026-08-09";

describe("guestKey", () => {
  it("matches the same person written differently", () => {
    expect(guestKey("CECH, Aurélie")).toBe(guestKey("cech aurelie"));
    expect(guestKey("DUPONT/MARIE")).toBe(guestKey("Marie Dupont"));
  });

  it("keeps different people apart", () => {
    expect(guestKey("DUPONT MARIE")).not.toBe(guestKey("DUPONT MARC"));
  });
});

describe("arrivalMinutesByGuest", () => {
  const history = [
    morning("2026-08-05", { "CECH AURELIE": "09:38" }),
    morning("2026-08-02", { "CECH AURELIE": "09:40" }),
    morning("2026-08-01", { "CECH AURELIE": "09:45" }),
  ];

  it("collects one arrival per morning, in local minutes", () => {
    const got = arrivalMinutesByGuest(history, TODAY);
    expect(got.get(guestKey("CECH AURELIE"))).toEqual([578, 580, 585]);
  });

  it("ignores today — a morning in progress is not history", () => {
    const withToday = [...history, morning(TODAY, { "CECH AURELIE": "07:10" })];
    expect(arrivalMinutesByGuest(withToday, TODAY).get(guestKey("CECH AURELIE"))).toEqual([578, 580, 585]);
  });

  it("counts the first cup of a morning, not the second", () => {
    const twice = morning("2026-07-30", { "CECH AURELIE": "09:30" });
    twice.checkIns.push({
      ...twice.checkIns[0],
      id: "again",
      timestamp: "2026-07-30T10:15:00",
    } as (typeof twice.checkIns)[number]);
    const got = arrivalMinutesByGuest([twice], TODAY);
    expect(got.get(guestKey("CECH AURELIE"))).toEqual([570]);
  });
});

describe("expectedSoon", () => {
  // Three mornings at ~09:40, which is what room 201's own screen shows.
  const history = [
    morning("2026-08-05", { "CECH AURELIE": "09:38", "BAKER TOM": "07:28" }),
    morning("2026-08-02", { "CECH AURELIE": "09:40", "BAKER TOM": "07:30" }),
    morning("2026-08-01", { "CECH AURELIE": "09:45", "BAKER TOM": "07:35" }),
  ];
  const today = [client("201", "CECH, Aurélie"), client("310", "BAKER, Tom")];

  it("gives the guest the time their own screen gives them", () => {
    const at7 = expectedSoon(today, [], history, TODAY, 7 * 60);
    expect(at7.find((e) => e.roomNumber === "201")?.at).toBe("09:40");
  });

  it("puts the soonest first — that is what bientôt means", () => {
    const at7 = expectedSoon(today, [], history, TODAY, 7 * 60);
    expect(at7.map((e) => e.roomNumber)).toEqual(["310", "201"]);
  });

  it("drops a guest whose hour has passed, rather than calling them soon", () => {
    // 09:05, the moment on the tablet. Tom's 07:30 is long gone.
    const at905 = expectedSoon(today, [], history, TODAY, 9 * 60 + 5);
    expect(at905.map((e) => e.roomNumber)).toEqual(["201"]);
  });

  it("keeps a guest who is a few minutes late — they are still walking down", () => {
    const justAfter = expectedSoon(today, [], history, TODAY, 7 * 60 + 35);
    expect(justAfter.map((e) => e.roomNumber)).toContain("310");
  });

  it("says nothing about a guest with too few mornings", () => {
    const thin = [morning("2026-08-05", { "NEW ONE": "08:00" })];
    const got = expectedSoon([client("404", "NEW, One")], [], thin, TODAY, 7 * 60);
    expect(got).toEqual([]);
  });

  it("says nothing about a guest with no usual hour", () => {
    // 06:40, 08:30, 10:10 — a spread of hours is not a habit.
    const scattered = [
      morning("2026-08-05", { "WANDER ER": "06:40" }),
      morning("2026-08-02", { "WANDER ER": "08:30" }),
      morning("2026-08-01", { "WANDER ER": "10:10" }),
    ];
    const got = expectedSoon([client("404", "WANDER, Er")], [], scattered, TODAY, 6 * 60);
    expect(got).toEqual([]);
  });

  it("stops naming someone who has already come down", () => {
    const done = [{ roomNumber: "201", clientName: "CECH, Aurélie" }] as Parameters<typeof expectedSoon>[1];
    const got = expectedSoon(today, done, history, TODAY, 7 * 60);
    expect(got.map((e) => e.roomNumber)).toEqual(["310"]);
  });

  it("shows the surname reception reads across a counter", () => {
    const got = expectedSoon(today, [], history, TODAY, 7 * 60);
    expect(got.find((e) => e.roomNumber === "201")?.surname).toBe("CECH");
  });
});
