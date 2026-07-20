import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client, CheckInRecord, DailyData, SessionRecord } from "@/lib/types";

function makeUnboundedLocalStorage() {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
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

async function loadStorage() {
  return await import("@/lib/storage");
}

let mock: ReturnType<typeof makeUnboundedLocalStorage>;

beforeEach(() => {
  vi.resetModules();
  mock = makeUnboundedLocalStorage();
  vi.stubGlobal("localStorage", mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("compression round-trip", () => {
  it("saves and reads back identical data", async () => {
    const { saveTodayData, getTodayData } = await loadStorage();
    const data: DailyData = {
      date: today,
      clients: [makeClient(), makeClient({ roomNumber: "102", name: "SECOND GUEST" })],
      checkIns: [
        { id: "a", roomNumber: "101", clientName: "TEST GUEST", peopleEntered: 1, timestamp: "t" },
      ],
      rawUploadText: "some ocr text",
    };
    saveTodayData(data);

    const read = getTodayData();
    expect(read?.clients).toHaveLength(2);
    expect(read?.clients[1].name).toBe("SECOND GUEST");
    expect(read?.checkIns).toHaveLength(1);
    expect(read?.rawUploadText).toBe("some ocr text");
  });

  it("actually stores a compressed payload, smaller than raw JSON for repetitive data", async () => {
    const { saveTodayData } = await loadStorage();
    // 120 similar clients — the real-world shape that fills the quota.
    const clients = Array.from({ length: 120 }, (_, i) =>
      makeClient({ roomNumber: `${100 + i}`, name: `GUEST NUMBER ${i}`, confirmationNumber: `${900000 + i}` })
    );
    saveTodayData({ date: today, clients, checkIns: [] });

    const stored = mock.store[`dailyData_${today}`];
    const rawJsonLen = JSON.stringify({ date: today, clients, checkIns: [] }).length;
    expect(stored.startsWith("LZ:")).toBe(true);
    // Compression must give real headroom (well under half the raw size here).
    expect(stored.length).toBeLessThan(rawJsonLen / 2);
  });
});

describe("backward compatibility with pre-upgrade (uncompressed) data", () => {
  it("reads legacy plaintext JSON that has no compression marker", async () => {
    const { getTodayData } = await loadStorage();
    // Simulate a tablet that already had today's session before the upgrade.
    const legacy: DailyData = {
      date: today,
      clients: [makeClient({ name: "LEGACY GUEST" })],
      checkIns: [],
      rawUploadText: "",
    };
    mock.store[`dailyData_${today}`] = JSON.stringify(legacy); // plain, no "LZ:"

    const read = getTodayData();
    expect(read?.clients[0].name).toBe("LEGACY GUEST");
  });
});

describe("crash-safety on corrupted storage", () => {
  it("getTodayData returns null instead of throwing on malformed-but-valid JSON", async () => {
    const { getTodayData } = await loadStorage();
    mock.store[`dailyData_${today}`] = JSON.stringify({ clients: 5, checkIns: null });
    expect(() => getTodayData()).not.toThrow();
    expect(getTodayData()).toBeNull();
  });

  it("getSessionHistory returns [] when the stored value isn't an array", async () => {
    const { getSessionHistory } = await loadStorage();
    mock.store["sessionHistory"] = JSON.stringify({ not: "an array" });
    expect(getSessionHistory()).toEqual([]);
  });

  it("autoCloseStale does not throw and reclaims a corrupted stale day", async () => {
    const { autoCloseStale } = await loadStorage();
    // A past-dated key whose shape would crash `.reduce` if not guarded.
    mock.store["dailyData_2000-01-01"] = JSON.stringify({ clients: 7 });
    expect(() => autoCloseStale()).not.toThrow();
    expect(mock.store["dailyData_2000-01-01"]).toBeUndefined();
  });
});

describe("ring-buffer retention", () => {
  it("closeDay keeps at most MAX_HISTORY_DAYS, dropping the oldest", async () => {
    const { saveTodayData, closeDay, getSessionHistory } = await loadStorage();

    // Seed 30 prior days directly into history storage as legacy plaintext —
    // decode() handles it, which also exercises backward compatibility.
    const seeded: SessionRecord[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2000-01-${String(i + 1).padStart(2, "0")}`,
      closedAt: "2000-01-01T00:00:00.000Z",
      totalRooms: 1,
      totalGuests: 1,
      totalEntered: 0,
      totalRemaining: 1,
      totalVip: 0,
      clients: [makeClient()],
      checkIns: [],
      rawUploadText: "",
    }));
    mock.store["sessionHistory"] = JSON.stringify(seeded);

    // Now close today → 31 entries → capped back to 30, with today at the front.
    saveTodayData({ date: today, clients: [makeClient()], checkIns: [] });
    closeDay();

    const history = getSessionHistory();
    expect(history.length).toBe(30);
    expect(history[0].date).toBe(today);
    // The oldest seeded day must have been evicted.
    expect(history.some((s) => s.date === "2000-01-30")).toBe(false);
  });
});
