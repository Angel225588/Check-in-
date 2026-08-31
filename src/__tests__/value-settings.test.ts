import { describe, it, expect, beforeEach } from "vitest";
import {
  readAssumptions,
  writeAssumptions,
  VALUE_SETTINGS_KEY,
} from "@/lib/value-settings";
import { DEFAULT_SECONDS_PER_COVER } from "@/lib/value-report";

beforeEach(() => {
  localStorage.clear();
});

describe("reading the assumptions", () => {
  it("starts at the brief's default of 20 seconds per cover", () => {
    expect(readAssumptions().secondsPerCover).toBe(DEFAULT_SECONDS_PER_COVER);
  });

  it("withholds the hourly rate until somebody sets it", () => {
    // There is no defensible default. A wrong one silently multiplies through
    // every euro on the report.
    expect(readAssumptions().hourlyRate).toBeNull();
  });

  it("withholds what they pay us until somebody sets it", () => {
    expect(readAssumptions().monthlyFee).toBeNull();
  });

  it("seeds the breakfast price from the hotel's existing cost setting", () => {
    // costPerCover is a number this hotel already maintains on the dashboard;
    // asking them for it twice invites two different answers.
    localStorage.setItem("app_settings", JSON.stringify({ costPerCover: 31 }));
    expect(readAssumptions().breakfastPrice).toBe(31);
  });

  it("survives junk in storage rather than taking the page down", () => {
    localStorage.setItem(VALUE_SETTINGS_KEY, "{not json");
    const a = readAssumptions();
    expect(a.secondsPerCover).toBe(DEFAULT_SECONDS_PER_COVER);
    expect(a.hourlyRate).toBeNull();
  });
});

describe("writing the assumptions", () => {
  it("round-trips what was set", () => {
    writeAssumptions({
      secondsPerCover: 45,
      hourlyRate: 22.5,
      breakfastPrice: 28,
      monthlyFee: 450,
    });
    expect(readAssumptions()).toEqual({
      secondsPerCover: 45,
      hourlyRate: 22.5,
      breakfastPrice: 28,
      monthlyFee: 450,
    });
  });

  it("takes one field at a time without erasing the others", () => {
    writeAssumptions({ hourlyRate: 20 });
    writeAssumptions({ monthlyFee: 300 });
    const a = readAssumptions();
    expect(a.hourlyRate).toBe(20);
    expect(a.monthlyFee).toBe(300);
  });

  it("clears a value back to unset", () => {
    writeAssumptions({ hourlyRate: 20 });
    writeAssumptions({ hourlyRate: null });
    expect(readAssumptions().hourlyRate).toBeNull();
  });

  it("refuses a negative or non-finite number rather than storing nonsense", () => {
    writeAssumptions({ secondsPerCover: -5 });
    expect(readAssumptions().secondsPerCover).toBe(DEFAULT_SECONDS_PER_COVER);

    writeAssumptions({ hourlyRate: Number.NaN });
    expect(readAssumptions().hourlyRate).toBeNull();

    writeAssumptions({ breakfastPrice: Number.POSITIVE_INFINITY });
    expect(readAssumptions().breakfastPrice).toBe(26);
  });

  it("keeps zero, which is a real answer", () => {
    // A hotel that gives breakfast away has a breakfast price of zero, and the
    // report should say the off-list covers were worth nothing rather than
    // silently substituting 26.
    writeAssumptions({ breakfastPrice: 0 });
    expect(readAssumptions().breakfastPrice).toBe(0);
  });
});
