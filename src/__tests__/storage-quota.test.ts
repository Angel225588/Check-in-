import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveClients,
  saveClientsMerged,
  getTodayData,
  reclaimStorageSpace,
  freeUpSpace,
} from "../lib/storage";
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
    expect((data!.rawUploadText ?? "").length).toBeLessThan(QUOTA);
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
    expect((data!.rawUploadText ?? "").length).toBeLessThan(QUOTA);
  });

  it("still persists rooms + raw text normally when under quota", () => {
    const clients = [makeClient("301", "Petit")];
    saveClientsMerged(clients, "small raw text");

    const data = getTodayData();
    expect(data).not.toBeNull();
    expect(data!.clients.length).toBe(1);
    expect(data!.rawUploadText).toContain("small raw text");
  });

  it("caps the persisted raw OCR text so it cannot bloat localStorage", () => {
    const clients = [makeClient("401", "Durand")];
    const enormousRaw = "Z".repeat(5_000_000); // 5MB raw OCR dump

    saveClientsMerged(clients, enormousRaw);

    const data = getTodayData();
    expect(data).not.toBeNull();
    expect(data!.clients.length).toBe(1);
    // Raw text is capped to a small snippet, not the full multi-MB dump.
    expect((data!.rawUploadText ?? "").length).toBeLessThanOrEqual(30_000);
  });
});

/**
 * Regression test for the upgrade case: a tablet that ran an OLDER build has
 * multi-MB raw OCR dumps already sitting in storage. reclaimStorageSpace()
 * runs at startup and trims them so today's session can save again.
 */
describe("reclaimStorageSpace strips pre-existing bloat", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("trims giant rawUploadText from existing history + daily data, keeps rooms", () => {
    const bloatedHistory = [
      {
        date: "2026-05-24",
        closedAt: "2026-05-24T08:00:00Z",
        totalRooms: 2,
        totalGuests: 4,
        totalEntered: 0,
        totalRemaining: 4,
        totalVip: 0,
        clients: [makeClient("101", "Old Guest A"), makeClient("102", "Old Guest B")],
        checkIns: [],
        rawUploadText: "A".repeat(2_000_000),
      },
    ];
    localStorage.setItem("sessionHistory", JSON.stringify(bloatedHistory));
    localStorage.setItem(
      "dailyData_2026-05-30",
      JSON.stringify({
        date: "2026-05-30",
        clients: [makeClient("201", "Yesterday Guest")],
        checkIns: [],
        rawUploadText: "B".repeat(2_000_000),
      })
    );

    const before =
      (localStorage.getItem("sessionHistory")?.length ?? 0) +
      (localStorage.getItem("dailyData_2026-05-30")?.length ?? 0);

    const reclaimed = reclaimStorageSpace();
    expect(reclaimed).toBeGreaterThan(3_000_000);

    const after =
      (localStorage.getItem("sessionHistory")?.length ?? 0) +
      (localStorage.getItem("dailyData_2026-05-30")?.length ?? 0);
    expect(after).toBeLessThan(before);

    // Rooms preserved, raw text trimmed.
    const hist = JSON.parse(localStorage.getItem("sessionHistory")!);
    expect(hist[0].clients.length).toBe(2);
    expect(hist[0].rawUploadText.length).toBeLessThanOrEqual(30_000);

    const day = JSON.parse(localStorage.getItem("dailyData_2026-05-30")!);
    expect(day.clients.length).toBe(1);
    expect(day.rawUploadText.length).toBeLessThanOrEqual(30_000);
  });

  it("is a no-op when nothing is bloated", () => {
    localStorage.setItem(
      "dailyData_2026-05-31",
      JSON.stringify({
        date: "2026-05-31",
        clients: [makeClient("301", "Today")],
        checkIns: [],
        rawUploadText: "tiny",
      })
    );
    expect(reclaimStorageSpace()).toBe(0);
    const day = JSON.parse(localStorage.getItem("dailyData_2026-05-31")!);
    expect(day.rawUploadText).toBe("tiny");
  });
});

/**
 * The manual "Free up space" Settings button. Must strip ALL raw text but
 * preserve every room, check-in, and session.
 */
describe("freeUpSpace removes only raw text, keeps everything else", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("clears raw text from history + daily data, preserves rooms/check-ins/stats", () => {
    const history = [
      {
        date: "2026-05-28",
        closedAt: "2026-05-28T08:00:00Z",
        totalRooms: 2,
        totalGuests: 4,
        totalEntered: 2,
        totalRemaining: 2,
        totalVip: 1,
        clients: [makeClient("101", "Guest A"), makeClient("102", "Guest B")],
        checkIns: [
          { id: "ci1", roomNumber: "101", clientName: "Guest A", peopleEntered: 2, timestamp: "2026-05-28T07:30:00Z" },
        ],
        rawUploadText: "R".repeat(1_000_000),
      },
    ];
    localStorage.setItem("sessionHistory", JSON.stringify(history));
    localStorage.setItem(
      "dailyData_2026-05-31",
      JSON.stringify({
        date: "2026-05-31",
        clients: [makeClient("201", "Today Guest")],
        checkIns: [],
        rawUploadText: "T".repeat(1_000_000),
      })
    );

    const freed = freeUpSpace();
    expect(freed).toBeGreaterThan(1_900_000);

    // History: rooms, check-ins, stats intact; raw text gone.
    const h = JSON.parse(localStorage.getItem("sessionHistory")!);
    expect(h[0].clients.length).toBe(2);
    expect(h[0].checkIns.length).toBe(1);
    expect(h[0].totalVip).toBe(1);
    expect(h[0].rawUploadText).toBe("");

    // Today's daily data: rooms intact; raw text gone.
    const day = JSON.parse(localStorage.getItem("dailyData_2026-05-31")!);
    expect(day.clients.length).toBe(1);
    expect(day.rawUploadText).toBe("");

    // The active session is still readable afterward (no bounce-to-upload).
    const active = getTodayData();
    expect(active).not.toBeNull();
    expect(active!.clients.length).toBe(1);
  });
});
