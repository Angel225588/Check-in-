import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueue,
  peekAll,
  peekDue,
  remove,
  scheduleRetry,
  hasPendingForDate,
  moveToDeadLetter,
  deadLetters,
} from "../lib/sync/outbox";

describe("outbox extensions (step 5)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("coalesces re-enqueue by dedupeKey: one entry, latest payload, merged dirtyFields", () => {
    enqueue({ entity: "client", op: "upsert", rowId: "c1", dedupeKey: "client:c1", payload: { id: "c1", name: "A" }, dirtyFields: ["name"] });
    enqueue({ entity: "client", op: "upsert", rowId: "c1", dedupeKey: "client:c1", payload: { id: "c1", name: "B" }, dirtyFields: ["room"] });
    const all = peekAll();
    expect(all).toHaveLength(1);
    expect((all[0].payload as { name: string }).name).toBe("B");
    expect((all[0].dirtyFields ?? []).slice().sort()).toEqual(["name", "room"]);
  });

  it("peekDue excludes a backed-off mutation until nextDueAt, then includes it", () => {
    const m = enqueue({ entity: "client", op: "upsert", payload: { id: "c1" } });
    scheduleRetry(m.id, 10_000, "boom");
    expect(peekDue(Date.now())).toHaveLength(0);
    expect(peekDue(Date.now() + 11_000)).toHaveLength(1);
  });

  it("hasPendingForDate reflects queued mutations for a date", () => {
    expect(hasPendingForDate("2026-06-21")).toBe(false);
    enqueue({ entity: "checkin", op: "upsert", serviceDate: "2026-06-21", payload: { id: "x" } });
    expect(hasPendingForDate("2026-06-21")).toBe(true);
    expect(hasPendingForDate("2026-06-22")).toBe(false);
  });

  it("moveToDeadLetter removes from queue but never loses it", () => {
    const m = enqueue({ entity: "client", op: "upsert", payload: { id: "c1" } });
    moveToDeadLetter(m.id);
    expect(peekAll()).toHaveLength(0);
    expect(deadLetters()).toHaveLength(1);
  });

  it("enqueue during a flush remove() loses no queued id (interleave-safe)", () => {
    const a = enqueue({ entity: "client", op: "upsert", payload: { id: "a" } });
    const b = enqueue({ entity: "client", op: "upsert", payload: { id: "b" } });
    remove(a.id); // flush removes the first
    const ids = peekAll().map((m) => (m.payload as { id: string }).id);
    expect(ids).toContain("b");
    expect(ids).not.toContain("a");
    void b;
  });

  it("under quota: trims rawUploadText from days, never the auth token, then persists", () => {
    localStorage.setItem("dailyData_2026-06-21", JSON.stringify({ date: "2026-06-21", clients: [], checkIns: [], rawUploadText: "BIG" }));
    localStorage.setItem("sb-imarketin-auth-token", "SESSION");
    const realSet = localStorage.setItem.bind(localStorage);
    let thrown = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((k: string, v: string) => {
      if (k === "imarketin_sync_outbox" && !thrown) {
        thrown = true;
        const e = new Error("quota") as Error & { name: string };
        e.name = "QuotaExceededError";
        throw e;
      }
      realSet(k, v);
    });

    enqueue({ entity: "client", op: "upsert", payload: { id: "c1" } });

    expect(peekAll()).toHaveLength(1); // persisted after retry
    expect(JSON.parse(localStorage.getItem("dailyData_2026-06-21")!).rawUploadText).toBe(""); // trimmed
    expect(localStorage.getItem("sb-imarketin-auth-token")).toBe("SESSION"); // protected
  });
});
