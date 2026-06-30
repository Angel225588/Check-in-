import { describe, it, expect, beforeEach } from "vitest";
import { saveTodayData, getTodayData, dropTodayRawText } from "@/lib/storage";
import { Client } from "@/lib/types";

function client(): Client {
  return {
    roomNumber: "101",
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name: "X",
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 1,
    children: 0,
    rateCode: "",
    packageCode: "",
  };
}

describe("dropTodayRawText — data minimization after parse", () => {
  beforeEach(() => localStorage.clear());

  it("clears the persisted raw OCR text for the open day", () => {
    saveTodayData({ date: "", clients: [], checkIns: [], rawUploadText: "RAW SECRET REPORT TEXT" });
    dropTodayRawText();
    expect(getTodayData()?.rawUploadText).toBe("");
  });

  it("preserves the clean roster while dropping raw text", () => {
    saveTodayData({ date: "", clients: [client()], checkIns: [], rawUploadText: "RAW" });
    dropTodayRawText();
    const d = getTodayData()!;
    expect(d.clients).toHaveLength(1);
    expect(d.rawUploadText).toBe("");
  });

  it("no-ops safely when there is no open day", () => {
    expect(() => dropTodayRawText()).not.toThrow();
  });
});
