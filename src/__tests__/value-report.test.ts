import { describe, it, expect } from "vitest";
import type { Client, CheckInRecord, DailyData } from "@/lib/types";
import {
  computeValueReport,
  DEFAULT_SECONDS_PER_COVER,
  monthOf,
  daysInMonth,
  type ValueAssumptions,
} from "@/lib/value-report";

// --- fixtures -------------------------------------------------------------
//
// Built by hand rather than by the seeder: the seeder randomises, and a value
// figure asserted against a random fixture is a figure nobody can check by
// reading the test.

function client(over: Partial<Client> & { roomNumber: string; name: string }): Client {
  return {
    arrivalDate: "2026-08-01",
    departureDate: "2026-08-03",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "BKF INC",
    vipSource: "breakfast_list",
    ...over,
  };
}

let seq = 0;
function checkIn(
  roomNumber: string,
  clientName: string,
  peopleEntered: number,
  time: string,
  over: Partial<CheckInRecord> = {}
): CheckInRecord {
  return {
    id: `ci-${++seq}`,
    roomNumber,
    clientName,
    peopleEntered,
    // Local wall clock on purpose: the app buckets arrivals by getHours().
    timestamp: new Date(`2026-08-04T${time}:00`).toISOString(),
    ...over,
  };
}

function day(date: string, clients: Client[], checkIns: CheckInRecord[]): DailyData {
  return { date, clients, checkIns };
}

const ASSUMPTIONS: ValueAssumptions = {
  secondsPerCover: 20,
  hourlyRate: 20,
  breakfastPrice: 26,
  monthlyFee: 300,
};

describe("month helpers", () => {
  it("derives the month key from a date", () => {
    expect(monthOf("2026-08-04")).toBe("2026-08");
  });

  it("bounds a month without walking off its end", () => {
    expect(daysInMonth("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(daysInMonth("2024-02")).toEqual({ first: "2024-02-01", last: "2024-02-29" });
    expect(daysInMonth("2026-08")).toEqual({ first: "2026-08-01", last: "2026-08-31" });
  });
});

describe("covers", () => {
  it("counts people, not check-ins", () => {
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "DUPONT Marie" })],
        [checkIn("101", "DUPONT Marie", 2, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(2);
  });

  it("only counts days inside the requested month", () => {
    const days = [
      day("2026-07-31", [client({ roomNumber: "101", name: "A A" })], [checkIn("101", "A A", 2, "08:00")]),
      day("2026-08-01", [client({ roomNumber: "102", name: "B B" })], [checkIn("102", "B B", 3, "08:00")]),
      day("2026-09-01", [client({ roomNumber: "103", name: "C C" })], [checkIn("103", "C C", 4, "08:00")]),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(3);
    expect(r.daysActive).toBe(1);
  });

  it("ignores days where nothing was served", () => {
    const days = [
      day("2026-08-01", [], []),
      day("2026-08-02", [client({ roomNumber: "101", name: "A A" })], [checkIn("101", "A A", 2, "08:00")]),
    ];
    expect(computeValueReport(days, "2026-08", ASSUMPTIONS).daysActive).toBe(1);
  });
});

describe("the key number — covers that were not entitled", () => {
  it("counts a walk-in as off-list", () => {
    const days = [
      day(
        "2026-08-04",
        [
          client({ roomNumber: "101", name: "ON LIST" }),
          client({ roomNumber: "205", name: "WALK IN", vipSource: "walk_in", packageCode: "", adults: 1 }),
        ],
        [checkIn("101", "ON LIST", 2, "08:00"), checkIn("205", "WALK IN", 1, "08:10")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(3);
    expect(r.offListCovers).toBe(1);
    expect(r.offListValue).toBe(26);
  });

  it("counts a VIP who was only on the VIP sheet as off-list", () => {
    const days = [
      day(
        "2026-08-04",
        [
          client({
            roomNumber: "310",
            name: "VIP ONLY",
            vipSource: "list_only",
            packageCode: "",
            isVip: true,
            adults: 2,
          }),
        ],
        [checkIn("310", "VIP ONLY", 2, "08:00")]
      ),
    ];
    expect(computeValueReport(days, "2026-08", ASSUMPTIONS).offListCovers).toBe(2);
  });

  it("counts a guest on the breakfast list whose booking never included breakfast", () => {
    // On the roster, but no BKF package — reception has to charge them. Before
    // us, nobody noticed and they ate free.
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "NO PKG", packageCode: "" })],
        [checkIn("101", "NO PKG", 2, "08:00")]
      ),
    ];
    expect(computeValueReport(days, "2026-08", ASSUMPTIONS).offListCovers).toBe(2);
  });

  it("counts extra people in an entitled room, but not the entitled ones", () => {
    // Room booked for 2, four people came down.
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "FAMILY", adults: 2 })],
        [checkIn("101", "FAMILY", 4, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(4);
    expect(r.offListCovers).toBe(2);
  });

  it("does not count an entitled guest, whatever the package", () => {
    for (const pkg of ["BKF INC", "BKF COMP", "BKF GRP", "BKF EXCL", "UPSFPDJ"]) {
      const days = [
        day(
          "2026-08-04",
          [client({ roomNumber: "101", name: "ENTITLED", packageCode: pkg })],
          [checkIn("101", "ENTITLED", 2, "08:00")]
        ),
      ];
      const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
      expect(`${pkg}:${r.offListCovers}`).toBe(`${pkg}:0`);
    }
  });

  it("never double counts a walk-in who also over-ran their own party size", () => {
    // The naive sum (walkInEntered + extras) would say 5 for 3 real people.
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "205", name: "WALK IN", vipSource: "walk_in", packageCode: "", adults: 1 })],
        [checkIn("205", "WALK IN", 3, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(3);
    expect(r.offListCovers).toBe(3);
  });

  it("a no-show is worth nothing — entitlement alone is not a cover", () => {
    const days = [
      day("2026-08-04", [client({ roomNumber: "101", name: "ABSENT" })], []),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.covers).toBe(0);
    expect(r.offListCovers).toBe(0);
    expect(r.offListValue).toBe(0);
  });

  it("breaks the off-list total down, and the parts sum to the whole", () => {
    const days = [
      day(
        "2026-08-04",
        [
          client({ roomNumber: "101", name: "FAMILY", adults: 2 }), // +2 extras
          client({ roomNumber: "205", name: "PAID", vipSource: "walk_in", packageCode: "", adults: 1 }),
          client({ roomNumber: "310", name: "VIP PTS", vipSource: "list_only", packageCode: "", isVip: true, adults: 1 }),
        ],
        [
          checkIn("101", "FAMILY", 4, "08:00"),
          checkIn("205", "PAID", 1, "08:05", { paymentAction: "card" }),
          checkIn("310", "VIP PTS", 1, "08:10", { paymentAction: "points" }),
        ]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.offListCovers).toBe(4);
    const summed = r.offListBreakdown.reduce((s, l) => s + l.covers, 0);
    expect(summed).toBe(r.offListCovers);
    expect(r.offListBreakdown.find((l) => l.key === "carte")?.covers).toBe(1);
    expect(r.offListBreakdown.find((l) => l.key === "points")?.covers).toBe(1);
    expect(r.offListBreakdown.find((l) => l.key === "extras")?.covers).toBe(2);
  });
});

describe("staff time", () => {
  it("converts covers to hours at the configured rate", () => {
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "A A", adults: 180 })],
        [checkIn("101", "A A", 180, "08:00")]
      ),
    ];
    // 180 covers x 20s = 3600s = exactly one hour.
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.hoursSaved).toBe(1);
    expect(r.staffValue).toBe(20);
  });

  it("honours a different seconds-per-cover", () => {
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "A A", adults: 180 })],
        [checkIn("101", "A A", 180, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", { ...ASSUMPTIONS, secondsPerCover: 40 });
    expect(r.hoursSaved).toBe(2);
    expect(r.staffValue).toBe(40);
  });

  it("reports hours but withholds euros when no hourly rate has been set", () => {
    // Hours are derived from what we recorded. The euro figure needs a number
    // only the hotel can supply, and inventing one is exactly what this report
    // exists to avoid.
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "A A", adults: 180 })],
        [checkIn("101", "A A", 180, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", { ...ASSUMPTIONS, hourlyRate: null });
    expect(r.hoursSaved).toBe(1);
    expect(r.staffValue).toBeNull();
    expect(r.totalValue).toBeNull();
  });

  it("defaults to 20 seconds per cover", () => {
    expect(DEFAULT_SECONDS_PER_COVER).toBe(20);
  });
});

describe("the busiest moments", () => {
  it("names the busiest service of the month", () => {
    const days = [
      day("2026-08-04", [client({ roomNumber: "101", name: "A A", adults: 10 })], [checkIn("101", "A A", 10, "08:00")]),
      day("2026-08-05", [client({ roomNumber: "101", name: "A A", adults: 40 })], [checkIn("101", "A A", 40, "08:00")]),
      day("2026-08-06", [client({ roomNumber: "101", name: "A A", adults: 25 })], [checkIn("101", "A A", 25, "08:00")]),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.busiestService).toEqual({ date: "2026-08-05", covers: 40 });
  });

  it("finds peak throughput in the busiest quarter hour", () => {
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "101", name: "A A", adults: 30 })],
        [
          checkIn("101", "A A", 4, "07:05"),
          // 08:00–08:15 — twelve people through the door
          checkIn("101", "A A", 5, "08:02"),
          checkIn("101", "A A", 7, "08:11"),
          checkIn("101", "A A", 6, "08:20"),
        ]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.peakQuarter).not.toBeNull();
    expect(r.peakQuarter!.covers).toBe(12);
    expect(r.peakQuarter!.time).toBe("08:00");
    expect(r.peakQuarter!.date).toBe("2026-08-04");
  });

  it("leaves the peak null rather than inventing one when nobody came", () => {
    const days = [day("2026-08-04", [client({ roomNumber: "101", name: "A A" })], [])];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.peakQuarter).toBeNull();
    expect(r.busiestService).toBeNull();
  });
});

describe("VIPs", () => {
  it("splits VIPs into those who came down and those who did not", () => {
    const days = [
      day(
        "2026-08-04",
        [
          client({ roomNumber: "101", name: "VIP CAME", isVip: true, vipLevel: "X4" }),
          client({ roomNumber: "102", name: "VIP ABSENT", isVip: true, vipLevel: "X5" }),
          client({ roomNumber: "103", name: "ORDINARY" }),
        ],
        [checkIn("101", "VIP CAME", 2, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.vipsTotal).toBe(2);
    expect(r.vipsServed).toBe(1);
    expect(r.vipsMissed).toBe(1);
  });

  it("counts a VIP once per service, not once per stay", () => {
    const vip = client({ roomNumber: "101", name: "VIP CAME", isVip: true, vipLevel: "X4" });
    const days = [
      day("2026-08-04", [vip], [checkIn("101", "VIP CAME", 2, "08:00")]),
      day("2026-08-05", [vip], []),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.vipsTotal).toBe(2);
    expect(r.vipsServed).toBe(1);
    expect(r.vipsMissed).toBe(1);
  });
});

describe("the bottom line", () => {
  it("adds the off-list value to the staff value", () => {
    const days = [
      day(
        "2026-08-04",
        [client({ roomNumber: "205", name: "WALK IN", vipSource: "walk_in", packageCode: "", adults: 180 })],
        [checkIn("205", "WALK IN", 180, "08:00")]
      ),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.offListValue).toBe(180 * 26);
    expect(r.staffValue).toBe(20);
    expect(r.totalValue).toBe(180 * 26 + 20);
    expect(r.monthlyFee).toBe(300);
  });

  it("withholds the comparison when nobody has said what they pay us", () => {
    const days = [
      day("2026-08-04", [client({ roomNumber: "101", name: "A A" })], [checkIn("101", "A A", 2, "08:00")]),
    ];
    const r = computeValueReport(days, "2026-08", { ...ASSUMPTIONS, monthlyFee: null });
    expect(r.monthlyFee).toBeNull();
  });

  it("echoes every assumption it was given, so the numbers can be argued with", () => {
    const days = [
      day("2026-08-04", [client({ roomNumber: "101", name: "A A" })], [checkIn("101", "A A", 2, "08:00")]),
    ];
    const r = computeValueReport(days, "2026-08", ASSUMPTIONS);
    expect(r.assumptions).toEqual(ASSUMPTIONS);
  });
});

describe("honesty about what we do not have", () => {
  it("reports an empty month without inventing a single figure", () => {
    const r = computeValueReport([], "2026-08", ASSUMPTIONS);
    expect(r.daysActive).toBe(0);
    expect(r.covers).toBe(0);
    expect(r.offListCovers).toBe(0);
    expect(r.offListValue).toBe(0);
    expect(r.hoursSaved).toBe(0);
    expect(r.busiestService).toBeNull();
    expect(r.peakQuarter).toBeNull();
    expect(r.hasData).toBe(false);
  });

  it("flags a month whose start is older than the retention window", () => {
    // Retention deletes the beginning of the month, so the total is a floor,
    // not a total — and the report has to say so rather than under-report
    // quietly.
    const days = [
      day("2026-08-20", [client({ roomNumber: "101", name: "A A" })], [checkIn("101", "A A", 2, "08:00")]),
    ];
    const clipped = computeValueReport(days, "2026-08", ASSUMPTIONS, {
      retentionDays: 10,
      todayIso: "2026-08-31",
    });
    expect(clipped.retentionLimited).toBe(true);
    expect(clipped.retainedFrom).toBe("2026-08-22");
  });

  it("a 30-day window CANNOT cover a 31-day month", () => {
    // Not an edge case — it is every August, and every month with 31 days.
    // Standing on the last day of the month, retention has already deleted the
    // first. A "monthly" report on a 30-day ring buffer is structurally a floor,
    // and this is the test that stops anyone quietly forgetting it.
    const r = computeValueReport([], "2026-08", ASSUMPTIONS, {
      retentionDays: 30,
      todayIso: "2026-08-31",
    });
    expect(r.retentionLimited).toBe(true);
    expect(r.retainedFrom).toBe("2026-08-02");
  });

  it("is not limited when the window reaches past the start of the month", () => {
    const r = computeValueReport([], "2026-02", ASSUMPTIONS, {
      retentionDays: 30,
      todayIso: "2026-02-28",
    });
    expect(r.retentionLimited).toBe(false);
    expect(r.retainedFrom).toBe("2026-01-30");
  });

  it("does not claim a total since inception", () => {
    const r = computeValueReport([], "2026-08", ASSUMPTIONS);
    expect(r).not.toHaveProperty("coversAllTime");
    expect(r).not.toHaveProperty("coversSinceStart");
  });
});
