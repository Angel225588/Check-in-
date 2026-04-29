import { describe, it, expect } from "vitest";
import { DailyData, CheckInRecord } from "@/lib/types";
import { getRushHourSlots, BucketMinutes } from "@/lib/analytics";

function ci(time: string, count = 1): CheckInRecord {
  return {
    id: time,
    roomNumber: "100",
    clientName: "Guest",
    peopleEntered: count,
    timestamp: `2026-04-29T${time}:00.000Z`,
  };
}

function dailyData(checkIns: CheckInRecord[]): DailyData {
  return {
    date: "2026-04-29",
    clients: [],
    checkIns,
  };
}

// Build the timestamp in LOCAL time so the test is timezone-independent
function ciLocal(hour: number, minute: number, count = 1): CheckInRecord {
  const d = new Date(2026, 3, 29, hour, minute, 0);
  return {
    id: `${hour}:${minute}`,
    roomNumber: "100",
    clientName: "Guest",
    peopleEntered: count,
    timestamp: d.toISOString(),
  };
}

describe("getRushHourSlots — bucket sizes", () => {
  it("defaults to 30-min buckets (backwards compat)", () => {
    const data = dailyData([ciLocal(7, 15, 2), ciLocal(7, 45, 3)]);
    const slots = getRushHourSlots(data);
    const at7 = slots.find((s) => s.time === "07:00");
    const at730 = slots.find((s) => s.time === "07:30");
    expect(at7?.count).toBe(2);
    expect(at730?.count).toBe(3);
  });

  it("supports 5-minute buckets", () => {
    const data = dailyData([
      ciLocal(7, 7, 1),
      ciLocal(7, 8, 1),
      ciLocal(7, 12, 2),
    ]);
    const slots = getRushHourSlots(data, 5);
    const at705 = slots.find((s) => s.time === "07:05");
    const at710 = slots.find((s) => s.time === "07:10");
    expect(at705?.count).toBe(2); // 07:07 + 07:08
    expect(at710?.count).toBe(2); // 07:12
  });

  it("supports 10-minute buckets", () => {
    const data = dailyData([ciLocal(7, 5, 1), ciLocal(7, 15, 2), ciLocal(7, 22, 3)]);
    const slots = getRushHourSlots(data, 10);
    expect(slots.find((s) => s.time === "07:00")?.count).toBe(1);
    expect(slots.find((s) => s.time === "07:10")?.count).toBe(2);
    expect(slots.find((s) => s.time === "07:20")?.count).toBe(3);
  });

  it("supports 60-minute buckets", () => {
    const data = dailyData([ciLocal(7, 5, 1), ciLocal(7, 45, 2), ciLocal(8, 10, 3)]);
    const slots = getRushHourSlots(data, 60);
    expect(slots.find((s) => s.time === "07:00")?.count).toBe(3);
    expect(slots.find((s) => s.time === "08:00")?.count).toBe(3);
  });

  it("flags the peak bucket correctly", () => {
    const data = dailyData([ciLocal(7, 0, 5), ciLocal(8, 0, 10), ciLocal(9, 0, 3)]);
    const slots = getRushHourSlots(data, 60);
    const peak = slots.find((s) => s.isPeak);
    expect(peak?.time).toBe("08:00");
    expect(peak?.count).toBe(10);
  });

  it("returns no peak when there are no check-ins", () => {
    const slots = getRushHourSlots(dailyData([]), 5);
    const peaks = slots.filter((s) => s.isPeak);
    expect(peaks).toHaveLength(0);
  });

  it("rejects unsupported bucket sizes by clamping to 30", () => {
    const data = dailyData([ciLocal(7, 15, 2)]);
    const slots = getRushHourSlots(data, 7 as BucketMinutes);
    // 7 is not in the allowed set, fallback to 30 → 07:00 bucket gets the count
    expect(slots.find((s) => s.time === "07:00")?.count).toBe(2);
  });

  it("count grows as bucket size shrinks (more granularity)", () => {
    const data = dailyData([ciLocal(7, 0, 1), ciLocal(7, 5, 1), ciLocal(7, 15, 1), ciLocal(7, 45, 1)]);
    const slots60 = getRushHourSlots(data, 60);
    const slots5 = getRushHourSlots(data, 5);
    expect(slots60.length).toBeLessThan(slots5.length);
    // 60-min: one bucket has 4
    expect(slots60.find((s) => s.time === "07:00")?.count).toBe(4);
    // 5-min: spread across multiple buckets
    expect(slots5.find((s) => s.time === "07:00")?.count).toBe(1);
    expect(slots5.find((s) => s.time === "07:05")?.count).toBe(1);
  });
});
