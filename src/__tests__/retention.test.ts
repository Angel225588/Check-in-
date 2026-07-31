import { describe, it, expect } from "vitest";
import {
  RETENTION_DAYS,
  compactSession,
  pruneByAge,
} from "@/lib/storage";
import type { SessionRecord } from "@/lib/types";

function sess(date: string, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    date,
    closedAt: date + "T11:00:00.000Z",
    totalRooms: 2,
    totalGuests: 4,
    totalEntered: 3,
    totalRemaining: 1,
    totalVip: 1,
    clients: [],
    checkIns: [],
    rawUploadText: "PAGE 1 OF 12 ... a very long OCR dump ...",
    ...extra,
  };
}

describe("compactSession", () => {
  // The raw OCR dump is debugging output. It is the single biggest thing in
  // storage and nothing in the report reads it.
  it("drops the raw OCR text", () => {
    expect(compactSession(sess("2026-07-01")).rawUploadText).toBe("");
  });

  it("keeps everything the report actually reads", () => {
    const s = sess("2026-07-01", {
      clients: [{ roomNumber: "101" }] as never,
      checkIns: [{ id: "c1" }] as never,
      discrepancies: [{ id: "d1" }] as never,
    });
    const c = compactSession(s);
    expect(c.clients).toHaveLength(1);
    expect(c.checkIns).toHaveLength(1);
    expect(c.discrepancies).toHaveLength(1);
    expect(c.totalEntered).toBe(3);
  });
});

describe("pruneByAge", () => {
  const today = "2026-07-31";

  it("keeps the retention window and drops what falls out of it", () => {
    const history = [
      sess("2026-07-31"),
      sess("2026-07-02"),   // 29 days back — inside
      sess("2026-07-01"),   // 30 days back — inside (boundary)
      sess("2026-06-30"),   // 31 days back — out
      sess("2026-01-04"),   // long gone
    ];
    const kept = pruneByAge(history, today).map((s) => s.date);
    expect(kept).toEqual(["2026-07-31", "2026-07-02", "2026-07-01"]);
  });

  it("uses a 30-day window", () => {
    expect(RETENTION_DAYS).toBe(30);
  });

  it("keeps a future-dated session rather than silently eating it", () => {
    // Clock skew on a tablet is real; dropping data because a date looks like
    // tomorrow would lose a real service.
    const kept = pruneByAge([sess("2026-08-02"), sess("2026-07-31")], today);
    expect(kept).toHaveLength(2);
  });

  it("drops an unparseable date instead of keeping junk forever", () => {
    const kept = pruneByAge([sess("not-a-date"), sess("2026-07-31")], today);
    expect(kept.map((s) => s.date)).toEqual(["2026-07-31"]);
  });

  it("returns newest first", () => {
    const kept = pruneByAge([sess("2026-07-10"), sess("2026-07-28"), sess("2026-07-20")], today);
    expect(kept.map((s) => s.date)).toEqual(["2026-07-28", "2026-07-20", "2026-07-10"]);
  });

  it("survives an empty history", () => {
    expect(pruneByAge([], today)).toEqual([]);
  });
});

describe("reclaimStorageSpace — the retention window", () => {
  it("drops whole days that have aged out, and keeps the ones inside", async () => {
    const { reclaimStorageSpace } = await import("@/lib/storage");
    const day = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().split("T")[0];
    };
    localStorage.clear();
    const mk = (date: string) =>
      JSON.stringify({ date, clients: [], checkIns: [], rawUploadText: "" });
    localStorage.setItem("dailyData_" + day(1), mk(day(1)));
    localStorage.setItem("dailyData_" + day(29), mk(day(29)));
    localStorage.setItem("dailyData_" + day(45), mk(day(45)));

    reclaimStorageSpace();

    expect(localStorage.getItem("dailyData_" + day(1))).not.toBeNull();
    expect(localStorage.getItem("dailyData_" + day(29))).not.toBeNull();
    expect(localStorage.getItem("dailyData_" + day(45))).toBeNull();
  });
});
