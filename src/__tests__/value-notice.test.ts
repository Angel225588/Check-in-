import { describe, it, expect, beforeEach } from "vitest";
import type { DailyData, Client, CheckInRecord } from "@/lib/types";
import {
  monthsWithData,
  previousMonth,
  pendingNotice,
  markMonthSeen,
  seenMonths,
} from "@/lib/value-notice";

function day(date: string): DailyData {
  const c: Client = {
    roomNumber: "101",
    name: "A A",
    arrivalDate: date,
    departureDate: date,
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "BKF INC",
    vipSource: "breakfast_list",
  };
  const ci: CheckInRecord = {
    id: `ci-${date}`,
    roomNumber: "101",
    clientName: "A A",
    peopleEntered: 2,
    timestamp: `${date}T08:00:00.000Z`,
  };
  return { date, clients: [c], checkIns: [ci] };
}

beforeEach(() => {
  localStorage.clear();
});

describe("months with data", () => {
  it("lists the months that have a service in them, newest first", () => {
    const days = [day("2026-06-30"), day("2026-07-02"), day("2026-08-04"), day("2026-08-05")];
    expect(monthsWithData(days)).toEqual(["2026-08", "2026-07", "2026-06"]);
  });

  it("ignores a day with a roster nobody attended, but keeps the month", () => {
    const empty: DailyData = { date: "2026-07-01", clients: [], checkIns: [] };
    expect(monthsWithData([empty, day("2026-08-01")])).toEqual(["2026-08"]);
  });

  it("returns nothing for a device that has never run a service", () => {
    expect(monthsWithData([])).toEqual([]);
  });
});

describe("previous month", () => {
  it("steps back one month", () => {
    expect(previousMonth("2026-08-04")).toBe("2026-07");
  });

  it("steps across a year boundary", () => {
    expect(previousMonth("2026-01-01")).toBe("2025-12");
  });
});

describe("the notice", () => {
  it("offers last month's report once the month has turned", () => {
    const days = [day("2026-07-10"), day("2026-07-20")];
    const n = pendingNotice(days, "2026-08-01");
    expect(n).not.toBeNull();
    expect(n!.month).toBe("2026-07");
    expect(n!.unread).toBe(true);
  });

  it("does not offer the month that is still running", () => {
    // Reporting August on 12 August is a half-month wearing a month's name.
    const days = [day("2026-08-01"), day("2026-08-12")];
    expect(pendingNotice(days, "2026-08-12")).toBeNull();
  });

  it("stays quiet when last month has no service in it", () => {
    const days = [day("2026-08-01")];
    expect(pendingNotice(days, "2026-08-02")).toBeNull();
  });

  it("goes read once the report has been opened, and stays read", () => {
    const days = [day("2026-07-10")];
    expect(pendingNotice(days, "2026-08-01")!.unread).toBe(true);

    markMonthSeen("2026-07");

    const after = pendingNotice(days, "2026-08-01");
    expect(after).not.toBeNull();
    expect(after!.unread).toBe(false);
    expect(seenMonths()).toContain("2026-07");
  });

  it("raises a fresh notice for the next month without forgetting the last", () => {
    markMonthSeen("2026-07");
    const days = [day("2026-07-10"), day("2026-08-10")];
    const n = pendingNotice(days, "2026-09-01");
    expect(n!.month).toBe("2026-08");
    expect(n!.unread).toBe(true);
    expect(seenMonths()).toContain("2026-07");
  });

  it("survives junk in storage rather than taking the home screen down", () => {
    localStorage.setItem("value_report_seen", "{not json");
    expect(seenMonths()).toEqual([]);
    expect(pendingNotice([day("2026-07-10")], "2026-08-01")!.unread).toBe(true);
  });
});
