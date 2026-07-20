import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client, CheckInRecord, DailyData, SessionRecord } from "@/lib/types";

/**
 * A localStorage mock with a hard byte budget, so we can reproduce the real
 * QuotaExceededError that happens on the reception tablet mid-shift.
 * setItem throws (like a real browser) when the write would exceed `maxBytes`;
 * removeItem always frees space (deletes succeed even when the store is full).
 */
function makeBoundedLocalStorage(maxBytes: number) {
  const store: Record<string, string> = {};
  const size = () =>
    Object.entries(store).reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    store,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      const projected = size() - (store[key]?.length ?? 0) + key.length + value.length;
      if (projected > maxBytes) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
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

// Re-import the module fresh for each test so it re-reads the stubbed global.
async function loadStorage() {
  return await import("@/lib/storage");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("addCheckIn — save result must be reported (no fake success)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when the check-in is actually persisted", async () => {
    vi.stubGlobal("localStorage", makeBoundedLocalStorage(5_000_000));
    const { saveTodayData, addCheckIn, getTodayData } = await loadStorage();
    saveTodayData({ date: today, clients: [makeClient()], checkIns: [] });

    const ok = addCheckIn(makeCheckIn());

    expect(ok).toBe(true);
    expect(getTodayData()?.checkIns).toHaveLength(1);
  });

  it("returns false when the write fails and cannot be recovered", async () => {
    // Tiny budget already fully consumed by the seeded day → no slack, nothing
    // stale to evict → the check-in genuinely cannot be saved.
    const mock = makeBoundedLocalStorage(600);
    vi.stubGlobal("localStorage", mock);
    const { saveTodayData, addCheckIn, getTodayData } = await loadStorage();
    // Seed today directly so the day exists, then jam the budget full.
    saveTodayData({ date: today, clients: [makeClient()], checkIns: [] });
    mock.store["_filler"] = "x".repeat(500);

    const ok = addCheckIn(makeCheckIn({ id: "should-not-persist" }));

    expect(ok).toBe(false);
    // The record must NOT appear as saved — the UI relies on this to warn.
    const persisted = getTodayData()?.checkIns ?? [];
    expect(persisted.some((c) => c.id === "should-not-persist")).toBe(false);
  });
});

describe("saveTodayData — recover space before failing", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("evicts stale history/day data and succeeds on retry", async () => {
    const mock = makeBoundedLocalStorage(4000);
    vi.stubGlobal("localStorage", mock);
    const { saveTodayData, getTodayData } = await loadStorage();

    // Fill most of the budget with EVICTABLE junk: an old day + fat history.
    const staleHistory: SessionRecord[] = [
      {
        date: "2000-01-01",
        closedAt: "2000-01-01T00:00:00.000Z",
        totalRooms: 1,
        totalGuests: 1,
        totalEntered: 0,
        totalRemaining: 1,
        totalVip: 0,
        clients: [makeClient()],
        checkIns: [],
        rawUploadText: "Z".repeat(1500), // bloat that recovery should strip
      },
    ];
    mock.store["sessionHistory"] = JSON.stringify(staleHistory);
    mock.store["dailyData_2000-01-01"] = JSON.stringify({
      date: "2000-01-01",
      clients: [makeClient()],
      checkIns: [],
      rawUploadText: "Y".repeat(1200),
    });

    // Now a fresh today write that would overflow without eviction.
    const ok = saveTodayData({
      date: today,
      clients: [makeClient(), makeClient({ roomNumber: "102" })],
      checkIns: [makeCheckIn()],
      rawUploadText: "A".repeat(400),
    });

    expect(ok).toBe(true);
    expect(getTodayData()?.clients).toHaveLength(2);
    // Stale day should have been reclaimed.
    expect(mock.store["dailyData_2000-01-01"]).toBeUndefined();
  });
});

describe("rawUploadText growth is bounded", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("caps combined rawUploadText so it can't blow the quota over a shift", async () => {
    vi.stubGlobal("localStorage", makeBoundedLocalStorage(5_000_000));
    const { saveClientsMerged, getTodayData } = await loadStorage();

    // Simulate many report photos across the day, each adding a big OCR blob.
    for (let i = 0; i < 40; i++) {
      saveClientsMerged(
        [makeClient({ roomNumber: `2${i.toString().padStart(2, "0")}`, name: `GUEST ${i}` })],
        "OCR_TEXT_BLOCK_".repeat(2000) // ~30KB each upload
      );
    }

    const raw = getTodayData()?.rawUploadText ?? "";
    // Must be bounded, not the ~1.2MB the naive concat would produce.
    expect(raw.length).toBeLessThanOrEqual(100_000);
    // Clients themselves are still all merged/retained.
    expect(getTodayData()?.clients.length).toBe(40);
  });
});
