import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client, CheckInRecord, DailyData } from "@/lib/types";

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
vi.stubGlobal("localStorage", localStorageMock);

import { removeCheckIn, getTodayData, saveTodayData } from "@/lib/storage";
import { getRemainingForRoom, getCheckedInCount } from "@/lib/utils";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "100",
    name: "TEST GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "", packageCode: "",
    ...overrides,
  };
}

const today = new Date().toISOString().split("T")[0];

function setupTodayData(checkIns: CheckInRecord[], clients: Client[] = [makeClient()]) {
  const data: DailyData = {
    date: today,
    clients,
    checkIns,
  };
  saveTodayData(data);
}

describe("removeCheckIn", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("removes the correct record by ID", () => {
    const checkIns: CheckInRecord[] = [
      { id: "a", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "2026-03-18T08:00:00Z" },
      { id: "b", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "2026-03-18T09:00:00Z" },
    ];
    setupTodayData(checkIns);

    const result = removeCheckIn("a");
    expect(result).toBe(true);

    const data = getTodayData();
    expect(data?.checkIns).toHaveLength(1);
    expect(data?.checkIns[0].id).toBe("b");
  });

  it("returns false for invalid ID (no-op)", () => {
    const checkIns: CheckInRecord[] = [
      { id: "a", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "2026-03-18T08:00:00Z" },
    ];
    setupTodayData(checkIns);

    const result = removeCheckIn("nonexistent");
    expect(result).toBe(false);

    const data = getTodayData();
    expect(data?.checkIns).toHaveLength(1);
  });

  it("after removal, getRemainingForRoom reflects updated count", () => {
    const client = makeClient({ adults: 2, children: 0 });
    const checkIns: CheckInRecord[] = [
      { id: "a", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "2026-03-18T08:00:00Z" },
      { id: "b", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "2026-03-18T09:00:00Z" },
    ];
    setupTodayData(checkIns, [client]);

    // Before: 0 remaining
    expect(getRemainingForRoom(client, checkIns)).toBe(0);

    removeCheckIn("b");
    const data = getTodayData()!;
    // After: 1 remaining
    expect(getRemainingForRoom(client, data.checkIns)).toBe(1);
  });

  it("after removal, getCheckedInCount reflects updated total", () => {
    const checkIns: CheckInRecord[] = [
      { id: "a", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 2, timestamp: "2026-03-18T08:00:00Z" },
      { id: "b", roomNumber: "202", clientName: "OTHER", peopleEntered: 3, timestamp: "2026-03-18T09:00:00Z" },
    ];
    setupTodayData(checkIns);

    expect(getCheckedInCount(checkIns)).toBe(5);

    removeCheckIn("a");
    const data = getTodayData()!;
    expect(getCheckedInCount(data.checkIns)).toBe(3);
  });
});
