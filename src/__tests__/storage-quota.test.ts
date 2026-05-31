import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveClients, saveClientsMerged, getTodayData } from "../lib/storage";
import { Client } from "../lib/types";

function makeClient(room: string, name: string): Client {
  return {
    roomNumber: room,
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name,
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "",
  };
}

/**
 * Regression test for the "click Start → bounced back to the upload screen,
 * have to re-upload the docs" bug.
 *
 * On iPad Safari / installed PWA the localStorage quota is small. The large
 * raw OCR text saved alongside the parsed rooms pushed the dailyData_* payload
 * over quota, localStorage.setItem threw QuotaExceededError, saveTodayData
 * swallowed it and returned false — so the session was never persisted. The
 * next screen then found no active session and sent the user back to upload.
 *
 * The fix: when the write fails because of the bulky raw text, drop the raw
 * text and retry so the rooms themselves still persist.
 */
describe("saveClientsMerged under localStorage quota pressure", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("persists the rooms even when the raw OCR text would exceed quota", () => {
    const realSetItem = Storage.prototype.setItem;
    const QUOTA = 5000; // pretend the dailyData payload cap is ~5KB

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith("dailyData_") && value.length > QUOTA) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      return realSetItem.call(this, key, value);
    });

    const clients = [makeClient("101", "Dupont"), makeClient("102", "Martin")];
    const hugeRaw = "X".repeat(20000); // larger than QUOTA on its own

    const result = saveClientsMerged(clients, hugeRaw);
    expect(result.merged.length).toBe(2);

    const data = getTodayData();
    expect(data).not.toBeNull();
    expect(data!.clients.length).toBe(2);
    // Raw text was dropped so the rooms could fit under quota.
    expect(data!.rawUploadText.length).toBeLessThan(QUOTA);
  });

  it("saveClients also persists rooms when raw text would exceed quota", () => {
    const realSetItem = Storage.prototype.setItem;
    const QUOTA = 5000;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith("dailyData_") && value.length > QUOTA) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      return realSetItem.call(this, key, value);
    });

    saveClients([makeClient("201", "Bernard")], "Y".repeat(20000));

    const data = getTodayData();
    expect(data).not.toBeNull();
    expect(data!.clients.length).toBe(1);
    expect(data!.rawUploadText.length).toBeLessThan(QUOTA);
  });

  it("still persists rooms + raw text normally when under quota", () => {
    const clients = [makeClient("301", "Petit")];
    saveClientsMerged(clients, "small raw text");

    const data = getTodayData();
    expect(data).not.toBeNull();
    expect(data!.clients.length).toBe(1);
    expect(data!.rawUploadText).toContain("small raw text");
  });
});
