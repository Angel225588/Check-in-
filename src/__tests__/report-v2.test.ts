import { describe, it, expect } from "vitest";
import {
  hhmm,
  minutesOfDay,
  buildAffluence,
  buildArrivalRows,
  filterRows,
  outcomeSplit,
  presencePercent,
  treemapShares,
  SERVICE_OPEN,
  SERVICE_CLOSE,
} from "@/lib/report-v2";
import { generateDayReport } from "@/lib/report";
import { Client, CheckInRecord } from "@/lib/types";

function mk(
  roomNumber: string,
  name: string,
  adults: number,
  children = 0,
  extra: Partial<Client> = {}
): Client {
  return {
    roomNumber,
    roomType: "DLXK",
    rtc: "",
    confirmationNumber: `9${roomNumber}`,
    name,
    arrivalDate: "01/03/26",
    departureDate: "05/03/26",
    reservationStatus: "CKIN",
    adults,
    children,
    rateCode: "",
    packageCode: "",
    ...extra,
  };
}

/** Local wall-clock ISO, so the tests read the same minutes the UI does. */
function at(h: number, m: number): string {
  const d = new Date(2026, 2, 7, h, m, 0);
  return d.toISOString();
}

const CLIENTS: Client[] = [
  mk("101", "DUPONT, MARIE", 2),
  mk("202", "LEFÈVRE, CLAIRE", 3, 1),
  mk("303", "ABSENT, PAUL", 2),
  mk("404", "ROSSI, ELENA", 1, 0, { isVip: true, vipLevel: "X4", vipSource: "walk_in" }),
  mk("505", "MARCHAND, LUC", 2, 0, { packageCode: "BKF COMP" }),
];

const CHECKINS: CheckInRecord[] = [
  { id: "1", roomNumber: "101", clientName: "DUPONT, MARIE", peopleEntered: 2, timestamp: at(9, 5) },
  { id: "2", roomNumber: "202", clientName: "LEFÈVRE, CLAIRE", peopleEntered: 2, timestamp: at(8, 30) },
  { id: "3", roomNumber: "404", clientName: "ROSSI, ELENA", peopleEntered: 1, timestamp: at(10, 5) },
  { id: "4", roomNumber: "505", clientName: "MARCHAND, LUC", peopleEntered: 2, timestamp: at(7, 45) },
];

const REPORT = generateDayReport(CLIENTS, CHECKINS);

describe("hhmm", () => {
  it("pads both halves", () => {
    expect(hhmm(SERVICE_OPEN)).toBe("06:30");
    expect(hhmm(SERVICE_CLOSE)).toBe("10:30");
    expect(hhmm(0)).toBe("00:00");
    expect(hhmm(9 * 60 + 5)).toBe("09:05");
  });

  // The first cut built times by concatenating a padded hour onto an unpadded
  // one and produced "010:05", which then also broke the string-compared sort.
  it("never emits a three-digit hour", () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      expect(hhmm(m)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("wraps past midnight instead of overflowing", () => {
    expect(hhmm(24 * 60)).toBe("00:00");
    expect(hhmm(25 * 60 + 3)).toBe("01:03");
  });

  it("survives a negative or non-finite input", () => {
    expect(hhmm(-30)).toBe("23:30");
    expect(hhmm(Number.NaN)).toBe("00:00");
  });
});

describe("minutesOfDay", () => {
  it("reads local wall-clock minutes off an ISO timestamp", () => {
    expect(minutesOfDay(at(8, 30))).toBe(8 * 60 + 30);
  });

  it("returns null for junk rather than NaN", () => {
    expect(minutesOfDay("not-a-date")).toBeNull();
    expect(minutesOfDay("")).toBeNull();
  });
});

describe("buildAffluence", () => {
  it("counts people, not check-ins", () => {
    const a = buildAffluence(CHECKINS, 30);
    expect(a.total).toBe(7); // 2 + 2 + 1 + 2
    expect(a.buckets.reduce((s, b) => s + b.count, 0)).toBe(7);
  });

  it("covers the service window at the chosen grain", () => {
    const a = buildAffluence(CHECKINS, 15);
    expect(a.grain).toBe(15);
    expect(a.open).toBeLessThanOrEqual(SERVICE_OPEN);
    expect(a.close).toBeGreaterThanOrEqual(SERVICE_CLOSE);
    expect(a.buckets.length).toBe(Math.ceil((a.close - a.open) / 15));
  });

  // Buckets are anchored on the window's left edge (06:30), not on the hour —
  // so at a 60-minute grain the bands read 06:30, 07:30, 08:30…
  it("puts each arrival in the bucket its time falls in", () => {
    const a = buildAffluence(CHECKINS, 60);
    expect(a.buckets[0].start).toBe(SERVICE_OPEN);
    const b = a.buckets.find((x) => x.start === 8 * 60 + 30);
    expect(b?.count).toBe(4); // room 202 at 08:30 (2) + room 101 at 09:05 (2)
    const early = a.buckets.find((x) => x.start === 7 * 60 + 30);
    expect(early?.count).toBe(2); // room 505 at 07:45
  });

  it("finds the busiest bucket", () => {
    const heavy: CheckInRecord[] = [
      ...CHECKINS,
      { id: "5", roomNumber: "606", clientName: "X", peopleEntered: 4, timestamp: at(8, 40) },
    ];
    const a = buildAffluence(heavy, 30);
    expect(a.peakCount).toBe(6); // 08:30 bucket: 2 + 4
    expect(a.buckets[a.peakIndex].start).toBe(8 * 60 + 30);
  });

  // A 06:05 arrival is real. Dropping it because it predates the service window
  // makes the chart disagree with the totals beside it.
  it("widens the window rather than dropping an early arrival", () => {
    const early: CheckInRecord[] = [
      { id: "e", roomNumber: "111", clientName: "EARLY", peopleEntered: 3, timestamp: at(6, 5) },
      ...CHECKINS,
    ];
    const a = buildAffluence(early, 15);
    expect(a.open).toBeLessThanOrEqual(6 * 60 + 5);
    expect(a.total).toBe(10);
    expect(a.buckets.reduce((s, b) => s + b.count, 0)).toBe(10);
  });

  it("keeps a late arrival inside the window too", () => {
    const late: CheckInRecord[] = [
      ...CHECKINS,
      { id: "l", roomNumber: "112", clientName: "LATE", peopleEntered: 1, timestamp: at(11, 20) },
    ];
    const a = buildAffluence(late, 30);
    expect(a.close).toBeGreaterThan(11 * 60 + 20);
    expect(a.buckets.reduce((s, b) => s + b.count, 0)).toBe(8);
  });

  it("clamps an absurd or missing grain instead of exploding", () => {
    expect(buildAffluence(CHECKINS, 0).grain).toBe(15);
    expect(buildAffluence(CHECKINS, Number.NaN).grain).toBe(15);
    expect(buildAffluence(CHECKINS, 9999).grain).toBe(120);
    expect(buildAffluence(CHECKINS, 7).grain).toBe(7);
  });

  it("returns an empty, non-crashing shape with no arrivals", () => {
    const a = buildAffluence([], 15);
    expect(a.total).toBe(0);
    expect(a.peakIndex).toBe(-1);
    expect(a.peakCount).toBe(0);
    expect(a.buckets.length).toBeGreaterThan(0);
  });

  it("ignores a check-in with an unparseable timestamp", () => {
    const bad: CheckInRecord[] = [
      ...CHECKINS,
      { id: "b", roomNumber: "999", clientName: "BAD", peopleEntered: 5, timestamp: "garbage" },
    ];
    expect(buildAffluence(bad, 15).total).toBe(7);
  });
});

describe("buildArrivalRows", () => {
  const rows = buildArrivalRows(REPORT);

  it("returns one row per room", () => {
    expect(rows.length).toBe(CLIENTS.length);
  });

  it("orders by the time people actually walked in", () => {
    const arrived = rows.filter((r) => r.minutes !== null).map((r) => r.roomNumber);
    expect(arrived).toEqual(["505", "202", "101", "404"]);
  });

  // The naive version compared "9:05" with "10:05" as strings and put the
  // 10 o'clock arrival first.
  it("sorts 09:05 before 10:05", () => {
    const i = rows.findIndex((r) => r.roomNumber === "101");
    const j = rows.findIndex((r) => r.roomNumber === "404");
    expect(i).toBeLessThan(j);
  });

  it("pushes no-shows to the end", () => {
    expect(rows[rows.length - 1].roomNumber).toBe("303");
    expect(rows[rows.length - 1].minutes).toBeNull();
    expect(rows[rows.length - 1].time).toBe("—");
  });

  it("carries the flags the list needs to render", () => {
    const vip = rows.find((r) => r.roomNumber === "404")!;
    expect(vip.isVip).toBe(true);
    expect(vip.offList).toBe(true);
    expect(vip.status).toBe("all-in");

    const comp = rows.find((r) => r.roomNumber === "505")!;
    expect(comp.isComp).toBe(true);

    const partial = rows.find((r) => r.roomNumber === "202")!;
    expect(partial.status).toBe("partial");
    expect(partial.entered).toBe(2);
    expect(partial.totalGuests).toBe(4);
  });
});

describe("filterRows", () => {
  const rows = buildArrivalRows(REPORT);
  const ecart = new Set(["202"]);

  it("returns everything unfiltered", () => {
    expect(filterRows(rows, "all", "", ecart).length).toBe(rows.length);
  });

  it("filters by outcome", () => {
    expect(filterRows(rows, "in", "", ecart).map((r) => r.roomNumber).sort())
      .toEqual(["101", "404", "505"]);
    expect(filterRows(rows, "partial", "", ecart).map((r) => r.roomNumber)).toEqual(["202"]);
    expect(filterRows(rows, "no", "", ecart).map((r) => r.roomNumber)).toEqual(["303"]);
  });

  it("filters by VIP, COMP, off-list and écart", () => {
    expect(filterRows(rows, "vip", "", ecart).map((r) => r.roomNumber)).toEqual(["404"]);
    expect(filterRows(rows, "comp", "", ecart).map((r) => r.roomNumber)).toEqual(["505"]);
    expect(filterRows(rows, "offlist", "", ecart).map((r) => r.roomNumber)).toEqual(["404"]);
    expect(filterRows(rows, "ecart", "", ecart).map((r) => r.roomNumber)).toEqual(["202"]);
  });

  it("matches a room by prefix", () => {
    expect(filterRows(rows, "all", "20", ecart).map((r) => r.roomNumber)).toEqual(["202"]);
  });

  // Reception types "lefevre"; the sheet says "LEFÈVRE". Both must find it.
  it("matches a name without its accents", () => {
    expect(filterRows(rows, "all", "lefevre", ecart).map((r) => r.roomNumber)).toEqual(["202"]);
    expect(filterRows(rows, "all", "LEFÈVRE", ecart).map((r) => r.roomNumber)).toEqual(["202"]);
  });

  it("combines a filter with a query", () => {
    expect(filterRows(rows, "no", "dupont", ecart)).toEqual([]);
    expect(filterRows(rows, "in", "dupont", ecart).map((r) => r.roomNumber)).toEqual(["101"]);
  });

  it("ignores surrounding whitespace", () => {
    expect(filterRows(rows, "all", "  101  ", ecart).map((r) => r.roomNumber)).toEqual(["101"]);
  });
});

describe("outcomeSplit / presencePercent", () => {
  const rows = buildArrivalRows(REPORT);

  it("splits into three buckets that sum to the total", () => {
    const s = outcomeSplit(rows);
    expect(s.allIn).toBe(3);
    expect(s.partial).toBe(1);
    expect(s.noShow).toBe(1);
    expect(s.allIn + s.partial + s.noShow).toBe(s.total);
  });

  it("reads presence off people, not rooms", () => {
    // 7 entered of 11 expected (2 + 4 + 2 + 1 + 2)
    expect(presencePercent(REPORT)).toBe(64);
  });

  it("is 0 rather than NaN on an empty day", () => {
    expect(presencePercent(generateDayReport([], []))).toBe(0);
  });

  it("never exceeds 100 when more people turn up than expected", () => {
    const over = generateDayReport(
      [mk("707", "OVER, ANNE", 1)],
      [{ id: "o", roomNumber: "707", clientName: "OVER, ANNE", peopleEntered: 4, timestamp: at(8, 0) }]
    );
    expect(presencePercent(over)).toBe(100);
  });
});

describe("treemapShares", () => {
  // Area encodes magnitude — until the area gets so small the label inside it
  // is clipped, at which point the box is lying anyway. A floor keeps every
  // block readable and flags the ones that were widened.
  it("keeps exact proportions when every block clears the floor", () => {
    const s = treemapShares([50, 50], 0.3);
    expect(s[0].share).toBeCloseTo(0.5);
    expect(s[1].share).toBeCloseTo(0.5);
    expect(s.every((x) => !x.floored)).toBe(true);
  });

  it("widens a block that would otherwise be a sliver, and says so", () => {
    const s = treemapShares([0, 24], 0.3);
    expect(s[0].share).toBeCloseTo(0.3);
    expect(s[1].share).toBeCloseTo(0.7);
    expect(s[0].floored).toBe(true);
    expect(s[1].floored).toBe(false);
  });

  it("still sums to one", () => {
    for (const vals of [[0, 24], [1, 99], [3, 3, 3], [0, 0, 7]]) {
      const total = treemapShares(vals, 0.25).reduce((n, x) => n + x.share, 0);
      expect(total).toBeCloseTo(1);
    }
  });

  it("splits evenly when everything is zero rather than dividing by it", () => {
    const s = treemapShares([0, 0], 0.3);
    expect(s[0].share).toBeCloseTo(0.5);
    expect(s[1].share).toBeCloseTo(0.5);
  });

  it("gives up on the floor when there is no room for it", () => {
    // Five blocks cannot each have 30%; the floor degrades to an equal split
    // instead of producing shares that sum past 1.
    const s = treemapShares([0, 0, 0, 0, 20], 0.3);
    expect(s.reduce((n, x) => n + x.share, 0)).toBeCloseTo(1);
    expect(Math.min(...s.map((x) => x.share))).toBeGreaterThan(0);
  });

  it("handles a single block", () => {
    expect(treemapShares([9], 0.3)).toEqual([{ share: 1, floored: false }]);
  });
});
