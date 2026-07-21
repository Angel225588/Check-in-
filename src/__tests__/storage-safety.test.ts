import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client, CheckInRecord, DailyData } from "@/lib/types";

// A localStorage mock with a hard byte budget so we can reproduce the real
// QuotaExceededError a reception tablet hits mid-shift.
function makeBoundedLocalStorage(maxBytes: number) {
  const store: Record<string, string> = {};
  const size = () =>
    Object.entries(store).reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    store,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      const projected = size() - (store[k]?.length ?? 0) + k.length + v.length;
      if (projected > maxBytes) {
        const e = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    roomNumber: "101",
    roomType: "DLXK",
    rtc: "",
    confirmationNumber: "100",
    name: "TEST GUEST",
    arrivalDate: "01/03/26",
    departureDate: "05/03/26",
    reservationStatus: "CKIN",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...overrides,
  };
}

const today = new Date().toISOString().split("T")[0];

function makeCheckIn(overrides: Partial<CheckInRecord> = {}): CheckInRecord {
  return {
    id: Math.random().toString(36).slice(2),
    roomNumber: "101",
    clientName: "TEST GUEST",
    peopleEntered: 1,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

async function loadStorage() {
  return await import("@/lib/storage");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
beforeEach(() => {
  vi.resetModules();
});

describe("addCheckIn reports the real save result (no fake success)", () => {
  it("returns true when the check-in is actually persisted", async () => {
    vi.stubGlobal("localStorage", makeBoundedLocalStorage(5_000_000));
    const { saveTodayData, addCheckIn, getTodayData } = await loadStorage();
    saveTodayData({ date: today, clients: [makeClient()], checkIns: [] });

    const ok = addCheckIn(makeCheckIn());

    expect(ok).toBe(true);
    expect(getTodayData()?.checkIns).toHaveLength(1);
  });

  it("returns false when the write cannot be persisted (storage full)", async () => {
    const mock = makeBoundedLocalStorage(700);
    vi.stubGlobal("localStorage", mock);
    const { saveTodayData, addCheckIn, getTodayData } = await loadStorage();
    saveTodayData({ date: today, clients: [makeClient()], checkIns: [] });
    // Jam the remaining budget so any further write throws.
    mock.store["_filler"] = "x".repeat(600);

    const ok = addCheckIn(makeCheckIn({ id: "should-not-persist" }));

    expect(ok).toBe(false);
    // The check-in screen relies on this to warn instead of showing a fake ✓.
    const persisted = getTodayData()?.checkIns ?? [];
    expect(persisted.some((c) => c.id === "should-not-persist")).toBe(false);
  });
});

describe("reads are crash-safe against corrupted storage", () => {
  it("getTodayData returns null instead of throwing on malformed JSON shape", async () => {
    const mock = makeBoundedLocalStorage(5_000_000);
    vi.stubGlobal("localStorage", mock);
    const { getTodayData } = await loadStorage();
    mock.store[`dailyData_${today}`] = JSON.stringify({ clients: 5, checkIns: null });
    expect(() => getTodayData()).not.toThrow();
    expect(getTodayData()).toBeNull();
  });

  it("getSessionHistory returns [] when the stored value isn't an array", async () => {
    const mock = makeBoundedLocalStorage(5_000_000);
    vi.stubGlobal("localStorage", mock);
    const { getSessionHistory } = await loadStorage();
    mock.store["sessionHistory"] = JSON.stringify({ not: "an array" });
    expect(getSessionHistory()).toEqual([]);
  });

  it("autoCloseStale does not throw and reclaims a corrupted stale day", async () => {
    const mock = makeBoundedLocalStorage(5_000_000);
    vi.stubGlobal("localStorage", mock);
    const { autoCloseStale } = await loadStorage();
    // A past-dated key whose shape would crash `.reduce` if unguarded.
    mock.store["dailyData_2000-01-01"] = JSON.stringify({ clients: 7 });
    expect(() => autoCloseStale()).not.toThrow();
    expect(mock.store["dailyData_2000-01-01"]).toBeUndefined();
  });
});
