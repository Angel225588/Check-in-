import { describe, it, expect } from "vitest";
import { reportDays, stepDay } from "@/lib/report-days";

const days = ["2026-08-01", "2026-07-31", "2026-07-30"];

describe("which days the report can show", () => {
  it("puts today first when a service is open, then history newest first", () => {
    expect(reportDays(days, "2026-08-02", true)).toEqual([
      "2026-08-02", "2026-08-01", "2026-07-31", "2026-07-30",
    ]);
  });

  it("omits today when nothing has been uploaded yet", () => {
    expect(reportDays(days, "2026-08-02", false)).toEqual(days);
  });

  // Closing the day writes today into history; it must not then appear twice.
  it("never lists the same day twice", () => {
    expect(reportDays(["2026-08-02", ...days], "2026-08-02", true))
      .toEqual(["2026-08-02", ...days]);
  });

  it("sorts history even when storage hands it back out of order", () => {
    expect(reportDays(["2026-07-30", "2026-08-01", "2026-07-31"], "2026-08-02", false))
      .toEqual(["2026-08-01", "2026-07-31", "2026-07-30"]);
  });
});

describe("stepping between days", () => {
  const list = ["2026-08-02", "2026-08-01", "2026-07-31"];

  it("goes back one day", () => {
    expect(stepDay(list, "2026-08-02", -1)).toBe("2026-08-01");
  });

  it("goes forward one day", () => {
    expect(stepDay(list, "2026-07-31", +1)).toBe("2026-08-01");
  });

  // The ends are real ends. Wrapping from the oldest day to today would look
  // like a jump backwards in time to anyone holding the tablet.
  it("stops at the ends instead of wrapping", () => {
    expect(stepDay(list, "2026-08-02", +1)).toBe(null);
    expect(stepDay(list, "2026-07-31", -1)).toBe(null);
  });

  it("returns null for a day that is not in the list", () => {
    expect(stepDay(list, "2026-01-01", -1)).toBe(null);
  });
});
