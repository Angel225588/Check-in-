/**
 * Retention: guest data must not live forever, and the purge must leave
 * evidence that it ran.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RETENTION_DEFAULT_DAYS,
  RETENTION_MIN_DAYS,
  RETENTION_MAX_DAYS,
  getRetentionDays,
  setRetentionDays,
} from "@/lib/privacy/config";
import { purgeExpired, PURGEABLE_STORES } from "@/lib/privacy/purge";
import { getPurgeLog, PURGE_LOG_KEY } from "@/lib/privacy/purge-log";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

const TODAY = "2026-08-23";
/** days before TODAY, as an ISO date */
const ago = (days: number) =>
  new Date(Date.parse(TODAY + "T00:00:00Z") - days * 86_400_000).toISOString().split("T")[0];

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  delete process.env.NEXT_PUBLIC_RETENTION_DAYS;
});

describe("retention window configuration", () => {
  it("defaults to 90 days", () => {
    expect(RETENTION_DEFAULT_DAYS).toBe(90);
    expect(getRetentionDays()).toBe(90);
  });

  it("is configurable by environment variable", () => {
    process.env.NEXT_PUBLIC_RETENTION_DAYS = "30";
    expect(getRetentionDays()).toBe(30);
  });

  it("is configurable at runtime, which wins over the environment", () => {
    process.env.NEXT_PUBLIC_RETENTION_DAYS = "90";
    setRetentionDays(30);
    expect(getRetentionDays()).toBe(30);
  });

  it("clamps a value that would keep data effectively forever", () => {
    setRetentionDays(100_000);
    expect(getRetentionDays()).toBe(RETENTION_MAX_DAYS);
  });

  it("clamps a value that would delete today's service mid-morning", () => {
    setRetentionDays(0);
    expect(getRetentionDays()).toBe(RETENTION_MIN_DAYS);
  });

  it("ignores junk rather than falling back to keeping everything", () => {
    process.env.NEXT_PUBLIC_RETENTION_DAYS = "not-a-number";
    expect(getRetentionDays()).toBe(RETENTION_DEFAULT_DAYS);
  });
});

describe("purge covers every store that holds personal data", () => {
  it("names all of them, so a new store is a deliberate decision", () => {
    expect([...PURGEABLE_STORES].sort()).toEqual(
      ["dailyData", "guestProfiles", "morningBriefs", "notes", "sessionHistory"].sort()
    );
  });
});

describe("purgeExpired", () => {
  it("drops session history older than the window and keeps the rest", async () => {
    localStorage.setItem("sessionHistory", JSON.stringify([
      { date: ago(10), clients: [], checkIns: [] },
      { date: ago(200), clients: [], checkIns: [] },
    ]));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    const kept = JSON.parse(localStorage.getItem("sessionHistory")!);
    expect(kept.map((s: { date: string }) => s.date)).toEqual([ago(10)]);
  });

  it("drops stale dailyData days", async () => {
    localStorage.setItem(`dailyData_${ago(5)}`, JSON.stringify({ date: ago(5), clients: [], checkIns: [] }));
    localStorage.setItem(`dailyData_${ago(400)}`, JSON.stringify({ date: ago(400), clients: [], checkIns: [] }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem(`dailyData_${ago(5)}`)).not.toBeNull();
    expect(localStorage.getItem(`dailyData_${ago(400)}`)).toBeNull();
  });

  it("drops morning briefs, which carry employee data and were never purged", async () => {
    localStorage.setItem(`morningBrief_${ago(2)}`, JSON.stringify({ date: ago(2) }));
    localStorage.setItem(`morningBrief_${ago(365)}`, JSON.stringify({ date: ago(365) }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem(`morningBrief_${ago(2)}`)).not.toBeNull();
    expect(localStorage.getItem(`morningBrief_${ago(365)}`)).toBeNull();
  });

  it("drops guest profiles not seen within the window", async () => {
    localStorage.setItem("guest_profiles", JSON.stringify([
      { id: "RECENT", name: "Recent", visitCount: 2, firstVisit: ago(300), lastVisit: ago(3), roomHistory: [] },
      { id: "STALE", name: "Stale", visitCount: 9, firstVisit: ago(900), lastVisit: ago(400), roomHistory: [] },
    ]));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    const kept = JSON.parse(localStorage.getItem("guest_profiles")!);
    expect(kept.map((g: { id: string }) => g.id)).toEqual(["RECENT"]);
  });

  it("keeps a profile whose first visit is ancient but who came back recently", async () => {
    // Retention runs on last contact, not first. A regular of ten years is not
    // stale data; a one-off from last spring is.
    localStorage.setItem("guest_profiles", JSON.stringify([
      { id: "LOYAL", name: "Loyal", visitCount: 40, firstVisit: ago(3000), lastVisit: ago(1), roomHistory: [] },
    ]));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(JSON.parse(localStorage.getItem("guest_profiles")!)).toHaveLength(1);
  });

  it("never deletes a future-dated day", async () => {
    // A tablet with a skewed clock still recorded a real service.
    const future = "2027-01-01";
    localStorage.setItem(`dailyData_${future}`, JSON.stringify({ date: future, clients: [], checkIns: [] }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem(`dailyData_${future}`)).not.toBeNull();
  });

  it("deletes a junk-dated record, which could never age out otherwise", async () => {
    localStorage.setItem("dailyData_not-a-date", JSON.stringify({ clients: [], checkIns: [] }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem("dailyData_not-a-date")).toBeNull();
  });

  it("leaves settings and the notes salt alone", async () => {
    localStorage.setItem("app_settings", JSON.stringify({ costPerCover: 26 }));
    localStorage.setItem("gn_salt", "deadbeef");
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem("app_settings")).not.toBeNull();
    expect(localStorage.getItem("gn_salt")).not.toBeNull();
  });

  it("is idempotent — a second run removes nothing more", async () => {
    localStorage.setItem(`dailyData_${ago(400)}`, JSON.stringify({ date: ago(400), clients: [], checkIns: [] }));
    const first = await purgeExpired({ todayIso: TODAY, days: 90 });
    const second = await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(first.totalRemoved).toBeGreaterThan(0);
    expect(second.totalRemoved).toBe(0);
  });
});

describe("purge log", () => {
  it("records what was removed, from which store, and under which window", async () => {
    localStorage.setItem(`dailyData_${ago(400)}`, JSON.stringify({ date: ago(400), clients: [], checkIns: [] }));
    await purgeExpired({ todayIso: TODAY, days: 90 });

    const log = getPurgeLog();
    expect(log.length).toBeGreaterThan(0);
    const entry = log.find((e) => e.store === "dailyData")!;
    expect(entry.recordsRemoved).toBe(1);
    expect(entry.retentionDays).toBe(90);
    expect(entry.ranAt).toBeTruthy();
  });

  it("holds no guest names — a purge log must not become a copy of the data", async () => {
    localStorage.setItem(`dailyData_${ago(400)}`, JSON.stringify({
      date: ago(400),
      clients: [{ roomNumber: "412", name: "DUPONT, Marie", adults: 2, children: 0 }],
      checkIns: [{ id: "1", roomNumber: "412", clientName: "DUPONT, Marie", peopleEntered: 2, timestamp: "" }],
    }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(localStorage.getItem(PURGE_LOG_KEY)).not.toMatch(/DUPONT|Marie/i);
  });

  it("does not log a run that removed nothing, so the log stays readable", async () => {
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(getPurgeLog()).toHaveLength(0);
  });

  it("survives its own retention — the log outlives the data it describes", async () => {
    // Evidence that data was deleted is useless if it is deleted on the same
    // schedule as the data.
    localStorage.setItem(PURGE_LOG_KEY, JSON.stringify([
      { id: "old", ranAt: ago(200) + "T06:00:00.000Z", store: "dailyData", recordsRemoved: 3, retentionDays: 90, oldestRemoved: "", newestRemoved: "", triggerSource: "auto" },
    ]));
    localStorage.setItem(`dailyData_${ago(400)}`, JSON.stringify({ date: ago(400), clients: [], checkIns: [] }));
    await purgeExpired({ todayIso: TODAY, days: 90 });
    expect(getPurgeLog().some((e) => e.id === "old")).toBe(true);
  });
});
