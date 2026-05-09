import { describe, it, expect } from "vitest";
import { Client, CheckInRecord, DailyData } from "@/lib/types";
import {
  computeMonthlyStats,
  formatMonthlyStatsMarkdown,
} from "@/lib/monthly-stats";

function client(over: Partial<Client> = {}): Client {
  return {
    roomNumber: "100",
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name: "Guest",
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...over,
  };
}

function checkIn(over: Partial<CheckInRecord> = {}): CheckInRecord {
  return {
    id: Math.random().toString(),
    roomNumber: "100",
    clientName: "Guest",
    peopleEntered: 2,
    timestamp: "2026-04-29T08:00:00Z",
    ...over,
  };
}

function day(date: string, clients: Client[], checkIns: CheckInRecord[]): DailyData {
  return { date, clients, checkIns };
}

describe("computeMonthlyStats", () => {
  it("returns zeros on empty history", () => {
    const stats = computeMonthlyStats([], 26);
    expect(stats.daysActive).toBe(0);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.compCost).toBe(0);
  });

  it("counts only days with clients (skips empty days)", () => {
    const data = [
      day("2026-04-29", [client({ name: "A" })], [checkIn({ clientName: "A" })]),
      day("2026-04-30", [], []),
    ];
    const stats = computeMonthlyStats(data, 26);
    expect(stats.daysActive).toBe(1);
    expect(stats.firstDay).toBe("2026-04-29");
  });

  it("computes attendance rate clamped at 100% even with extras", () => {
    const data = [
      day(
        "2026-04-29",
        [client({ name: "A", adults: 2, children: 0 })],
        [checkIn({ clientName: "A", peopleEntered: 5 })] // 5 entered, 2 expected
      ),
    ];
    const stats = computeMonthlyStats(data, 26);
    expect(stats.attendanceRate).toBe(100);
    expect(stats.attendanceRateMax).toBe(100);
  });

  it("aggregates compliments with cost (children excluded by isComp)", () => {
    const data = [
      day(
        "2026-04-29",
        [
          client({ roomNumber: "100", name: "A", adults: 2, packageCode: "BKF COMP" }),
          client({ roomNumber: "200", name: "B", adults: 1, packageCode: "BKF INC" }),
        ],
        [
          checkIn({ roomNumber: "100", clientName: "A", peopleEntered: 2 }),
          checkIn({ roomNumber: "200", clientName: "B", peopleEntered: 1 }),
        ]
      ),
    ];
    const stats = computeMonthlyStats(data, 26);
    expect(stats.compRooms).toBe(1);
    expect(stats.compPersons).toBe(2);
    expect(stats.compCost).toBe(2 * 26);
  });

  it("counts VIPs served vs missed", () => {
    const data = [
      day(
        "2026-04-29",
        [
          client({ roomNumber: "100", name: "VIP A", isVip: true }),
          client({ roomNumber: "200", name: "VIP B", isVip: true }),
          client({ roomNumber: "300", name: "Regular" }),
        ],
        [checkIn({ roomNumber: "100", clientName: "VIP A", peopleEntered: 1 })]
      ),
    ];
    const stats = computeMonthlyStats(data, 26);
    expect(stats.vipsTotal).toBe(2);
    expect(stats.vipsServed).toBe(1);
    expect(stats.vipsMissed).toBe(1);
  });

  it("identifies the most common peak hour across days", () => {
    const data = [
      day(
        "2026-04-29",
        [client({ name: "A" })],
        [checkIn({ clientName: "A", timestamp: new Date(2026, 3, 29, 8, 30).toISOString() })]
      ),
      day(
        "2026-04-30",
        [client({ name: "B" })],
        [checkIn({ clientName: "B", timestamp: new Date(2026, 3, 30, 8, 15).toISOString() })]
      ),
    ];
    const stats = computeMonthlyStats(data, 26);
    expect(stats.peakHourMostCommon).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatMonthlyStatsMarkdown", () => {
  it("returns a friendly empty message when no data", () => {
    const stats = computeMonthlyStats([], 26);
    expect(formatMonthlyStatsMarkdown(stats)).toContain("Aucune donnée");
  });

  it("includes key sections when data exists", () => {
    const data = [
      day(
        "2026-04-29",
        [client({ name: "A" })],
        [checkIn({ clientName: "A", peopleEntered: 2 })]
      ),
    ];
    const md = formatMonthlyStatsMarkdown(computeMonthlyStats(data, 26));
    expect(md).toContain("Bilan Pilote");
    expect(md).toContain("Volumes");
    expect(md).toContain("Compliments");
    expect(md).toContain("Walk-ins");
    expect(md).toContain("VIPs");
  });
});
