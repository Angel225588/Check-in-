import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client, CheckInRecord, SessionRecord, DailyData } from "@/lib/types";

// Mock localStorage (same pattern as undo-checkin.test.ts)
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
vi.stubGlobal("localStorage", localStorageMock);

import { purgeStaleRawText, getSessionHistory, getTodayData, saveTodayData } from "@/lib/storage";

function makeClient(o: Partial<Client> = {}): Client {
  return {
    roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "1",
    name: "TEST GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "", packageCode: "", ...o,
  };
}
function makeSession(date: string, raw: string): SessionRecord {
  return {
    date, closedAt: new Date().toISOString(), totalRooms: 1, totalGuests: 2,
    totalEntered: 0, totalRemaining: 2, totalVip: 0,
    clients: [makeClient()], checkIns: [] as CheckInRecord[], rawUploadText: raw,
  };
}

const today = new Date().toISOString().split("T")[0];

describe("purgeStaleRawText (S0 auto-purge)", () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it("clears rawUploadText from all closed history sessions and reports chars freed", () => {
    const big = "X".repeat(5000);
    const history: SessionRecord[] = [makeSession("2026-06-27", big), makeSession("2026-06-26", big)];
    localStorage.setItem("sessionHistory", JSON.stringify(history));

    const freed = purgeStaleRawText();

    expect(freed).toBe(10000);
    const after = getSessionHistory();
    expect(after).toHaveLength(2);
    for (const s of after) {
      expect(s.rawUploadText).toBe("");      // raw OCR text gone
      expect(s.clients).toHaveLength(1);      // clean data preserved
      expect(s.totalGuests).toBe(2);          // metrics preserved
    }
  });

  it("does NOT touch today's open session (only closed history)", () => {
    const todayData: DailyData = { date: today, clients: [makeClient()], checkIns: [], rawUploadText: "KEEP ME" };
    saveTodayData(todayData);
    localStorage.setItem("sessionHistory", JSON.stringify([makeSession("2026-06-25", "OLD")]));

    purgeStaleRawText();

    expect(getTodayData()?.rawUploadText).toBe("KEEP ME");
  });

  it("is idempotent — a second call frees nothing", () => {
    localStorage.setItem("sessionHistory", JSON.stringify([makeSession("2026-06-24", "ABC")]));
    expect(purgeStaleRawText()).toBe(3);
    expect(purgeStaleRawText()).toBe(0);
  });
});
