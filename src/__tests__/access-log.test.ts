/**
 * Who accessed which guest's data, when — retained separately from the data
 * itself, so the retention purge cannot destroy the evidence along with it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  ACCESS_LOG_KEY,
  recordAccess,
  getAccessLog,
  getAccessLogForGuest,
  pruneAccessLog,
} from "@/lib/privacy/access-log";
import { purgeExpired } from "@/lib/privacy/purge";

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe("recording an access", () => {
  it("records actor, action, resource and time", async () => {
    await recordAccess({ actor: "reception", action: "view", resource: "checkin", guestName: "DUPONT, Marie", roomNumber: "412" });
    const log = getAccessLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: "reception", action: "view", resource: "checkin", roomNumber: "412" });
    expect(log[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stores a hashed subject reference, never the guest's name", async () => {
    // An access log full of guest names is a second copy of the data it audits.
    await recordAccess({ actor: "reception", action: "view", resource: "checkin", guestName: "DUPONT, Marie" });
    expect(localStorage.getItem(ACCESS_LOG_KEY)).not.toMatch(/DUPONT|Marie/i);
    expect(getAccessLog()[0].subjectRef).toMatch(/^[0-9a-f]{16,}$/);
  });

  it("gives the same guest the same reference across entries, so a trail can be followed", async () => {
    await recordAccess({ actor: "a", action: "view", resource: "checkin", guestName: "DUPONT, Marie" });
    await recordAccess({ actor: "b", action: "export", resource: "report", guestName: "Dupont Marie" });
    const [x, y] = getAccessLog();
    expect(x.subjectRef).toBe(y.subjectRef);
  });

  it("gives different guests different references", async () => {
    await recordAccess({ actor: "a", action: "view", resource: "checkin", guestName: "DUPONT, Marie" });
    await recordAccess({ actor: "a", action: "view", resource: "checkin", guestName: "MARTIN, Jean" });
    const [x, y] = getAccessLog();
    expect(x.subjectRef).not.toBe(y.subjectRef);
  });

  it("records an access with no guest attached, such as a whole-roster export", async () => {
    await recordAccess({ actor: "manager", action: "export", resource: "daily-report" });
    expect(getAccessLog()[0].subjectRef).toBe("");
  });

  it("finds every access to one guest", async () => {
    await recordAccess({ actor: "a", action: "view", resource: "checkin", guestName: "DUPONT, Marie" });
    await recordAccess({ actor: "b", action: "view", resource: "checkin", guestName: "MARTIN, Jean" });
    await recordAccess({ actor: "c", action: "note-read", resource: "notes", guestName: "DUPONT, Marie" });
    const trail = await getAccessLogForGuest("DUPONT, Marie");
    expect(trail.map((e) => e.actor).sort()).toEqual(["a", "c"]);
  });
});

describe("the log is append-only", () => {
  it("exposes no way to edit or remove a single entry", async () => {
    const mod = await import("@/lib/privacy/access-log");
    const mutators = Object.keys(mod).filter((k) => /^(update|edit|delete|remove)/i.test(k));
    expect(mutators).toEqual([]);
  });

  it("keeps earlier entries when a new one is written", async () => {
    await recordAccess({ actor: "first", action: "view", resource: "checkin" });
    await recordAccess({ actor: "second", action: "view", resource: "checkin" });
    expect(getAccessLog().map((e) => e.actor)).toEqual(["first", "second"]);
  });
});

describe("the log outlives the data it describes", () => {
  it("is not touched by the guest-data retention purge", async () => {
    await recordAccess({ actor: "reception", action: "view", resource: "checkin", guestName: "DUPONT, Marie" });
    await purgeExpired({ todayIso: "2026-08-23", days: 90 });
    expect(getAccessLog()).toHaveLength(1);
  });

  it("keeps an entry older than the guest-data window", async () => {
    // 200 days: well past a 90-day data window, well inside the 365-day log window.
    localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify([
      { id: "x", at: ago(200), actor: "r", action: "view", resource: "checkin", subjectRef: "", roomNumber: "", detail: {} },
    ]));
    pruneAccessLog();
    expect(getAccessLog()).toHaveLength(1);
  });

  it("eventually drops an entry past its own longer window", async () => {
    localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify([
      { id: "x", at: ago(400), actor: "r", action: "view", resource: "checkin", subjectRef: "", roomNumber: "", detail: {} },
    ]));
    pruneAccessLog();
    expect(getAccessLog()).toHaveLength(0);
  });
});
