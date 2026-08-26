/**
 * Art. 15 (access/portability) and Art. 17 (erasure), for one guest and for a
 * whole property. As processor the app must be able to serve both on the
 * controller's instruction — Art. 28(3)(e) and 28(3)(g).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { exportGuest, eraseGuest, exportProperty, eraseProperty } from "@/lib/privacy/subject-rights";
import { addNote, loadNotes } from "@/lib/notes-store";
import { getAccessLog, ACCESS_LOG_KEY } from "@/lib/privacy/access-log";
import { getPurgeLog } from "@/lib/privacy/purge-log";
import { __resetKeyCache } from "@/lib/notes-crypto";
import { __resetSecureStore, hydrateSecureStore, secureGet } from "@/lib/secure-store";

const MARIE = "DUPONT, Marie";
const JEAN = "MARTIN, Jean";

function seedDay(date: string) {
  localStorage.setItem(`dailyData_${date}`, JSON.stringify({
    date,
    clients: [
      { roomNumber: "412", name: MARIE, adults: 2, children: 0, packageCode: "BKF INC" },
      { roomNumber: "108", name: JEAN, adults: 1, children: 0, packageCode: "" },
    ],
    checkIns: [
      { id: "c1", roomNumber: "412", clientName: MARIE, peopleEntered: 2, timestamp: `${date}T07:12:00Z` },
      { id: "c2", roomNumber: "108", clientName: JEAN, peopleEntered: 1, timestamp: `${date}T08:01:00Z` },
    ],
    discrepancies: [],
  }));
}

function seedHistory(date: string) {
  localStorage.setItem("sessionHistory", JSON.stringify([{
    date, closedAt: `${date}T11:00:00Z`, totalRooms: 2, totalGuests: 3,
    totalEntered: 3, totalRemaining: 0, totalVip: 0,
    clients: [
      { roomNumber: "412", name: MARIE, adults: 2, children: 0, packageCode: "BKF INC" },
      { roomNumber: "108", name: JEAN, adults: 1, children: 0, packageCode: "" },
    ],
    checkIns: [{ id: "h1", roomNumber: "412", clientName: MARIE, peopleEntered: 2, timestamp: `${date}T07:12:00Z` }],
  }]));
}

function seedProfiles() {
  localStorage.setItem("guest_profiles", JSON.stringify([
    { id: "DUPONTMARIE", name: MARIE, visitCount: 4, firstVisit: "2026-01-01", lastVisit: "2026-08-20", roomHistory: ["412"] },
    { id: "MARTINJEAN", name: JEAN, visitCount: 1, firstVisit: "2026-08-01", lastVisit: "2026-08-01", roomHistory: ["108"] },
  ]));
}

beforeEach(async () => {
  localStorage.clear();
  __resetSecureStore();
  __resetKeyCache();
  seedDay("2026-08-23");
  seedHistory("2026-08-20");
  seedProfiles();
  // Adopt the seeded plaintext into the encrypted store, as the app does when
  // it opens on a device that is already in service.
  await hydrateSecureStore();
  await addNote(MARIE, { tone: "alert", title: "Allergie arachide", body: "sévère", author: "reception" });
  await addNote(JEAN, { tone: "info", title: "Étage haut", body: "", author: "reception" });
});

describe("exporting one guest", () => {
  it("returns their roster rows, check-ins, profile and notes", async () => {
    const out = await exportGuest(MARIE, { actor: "dpo" });
    expect(out.guest.displayName).toBe(MARIE);
    expect(out.clients.length).toBeGreaterThan(0);
    expect(out.checkIns.length).toBeGreaterThan(0);
    expect(out.profile?.visitCount).toBe(4);
    expect(out.notes.map((n) => n.title)).toContain("Allergie arachide");
  });

  it("includes nothing belonging to another guest", async () => {
    const out = await exportGuest(MARIE, { actor: "dpo" });
    const blob = JSON.stringify(out);
    expect(blob).not.toMatch(/MARTIN|Jean|Étage haut/);
  });

  it("matches the guest across spelling variants of the same name", async () => {
    const out = await exportGuest("Dupont  marie", { actor: "dpo" });
    expect(out.clients.length).toBeGreaterThan(0);
  });

  it("includes the access trail for that guest", async () => {
    await exportGuest(MARIE, { actor: "dpo" });
    const second = await exportGuest(MARIE, { actor: "dpo" });
    expect(second.accessLog.length).toBeGreaterThan(0);
  });

  it("returns an empty but well-formed export for an unknown guest", async () => {
    const out = await exportGuest("NOBODY, Nobody", { actor: "dpo" });
    expect(out.clients).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.profile).toBeNull();
  });

  it("logs the export as an access, because an export IS an access", async () => {
    await exportGuest(MARIE, { actor: "dpo" });
    expect(getAccessLog().some((e) => e.action === "export")).toBe(true);
  });
});

describe("erasing one guest", () => {
  it("removes them from the live day, history, profiles and notes", async () => {
    await eraseGuest(MARIE, { actor: "dpo" });

    const day = JSON.parse(secureGet("dailyData_2026-08-23")!);
    expect(day.clients.map((c: { name: string }) => c.name)).toEqual([JEAN]);
    expect(day.checkIns.map((c: { clientName: string }) => c.clientName)).toEqual([JEAN]);

    const history = JSON.parse(secureGet("sessionHistory")!);
    expect(JSON.stringify(history)).not.toMatch(/DUPONT|Marie/);

    const profiles = JSON.parse(secureGet("guest_profiles")!);
    expect(profiles.map((p: { id: string }) => p.id)).toEqual(["MARTINJEAN"]);

    expect(await loadNotes(MARIE)).toEqual([]);
  });

  it("leaves every other guest untouched", async () => {
    await eraseGuest(MARIE, { actor: "dpo" });
    expect((await loadNotes(JEAN)).map((n) => n.title)).toEqual(["Étage haut"]);
    const day = JSON.parse(secureGet("dailyData_2026-08-23")!);
    expect(day.clients).toHaveLength(1);
  });

  it("reports what it removed", async () => {
    const report = await eraseGuest(MARIE, { actor: "dpo" });
    expect(report.recordsRemoved).toBeGreaterThan(0);
    expect(report.stores).toContain("notes");
  });

  it("is idempotent — erasing twice is not an error", async () => {
    await eraseGuest(MARIE, { actor: "dpo" });
    const second = await eraseGuest(MARIE, { actor: "dpo" });
    expect(second.recordsRemoved).toBe(0);
  });

  it("writes a purge-log entry, so the erasure is provable afterwards", async () => {
    await eraseGuest(MARIE, { actor: "dpo" });
    expect(getPurgeLog().some((e) => e.triggerSource === "erasure-request")).toBe(true);
  });

  it("keeps the access log, which must outlive the erased data", async () => {
    // Art. 5(2) accountability: erasing the audit trail along with the data
    // would leave the hotel unable to show what happened. The trail holds a
    // hash, not a name, so it is not itself a copy of the erased data.
    await eraseGuest(MARIE, { actor: "dpo" });
    expect(getAccessLog().length).toBeGreaterThan(0);
    expect(localStorage.getItem(ACCESS_LOG_KEY)).not.toMatch(/DUPONT|Marie/i);
  });
});

describe("exporting a whole property", () => {
  it("includes every day, guest, profile and note", async () => {
    const out = await exportProperty({ actor: "dpo" });
    expect(out.days.length).toBeGreaterThan(0);
    expect(out.sessionHistory.length).toBeGreaterThan(0);
    expect(out.guestProfiles).toHaveLength(2);
    expect(out.notes.length).toBeGreaterThan(0);
  });

  it("states the retention window in force, which a hotel has to be able to show", async () => {
    const out = await exportProperty({ actor: "dpo" });
    expect(out.meta.retentionDays).toBeGreaterThan(0);
    expect(out.meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("erasing a whole property", () => {
  it("removes all guest data", async () => {
    await eraseProperty({ actor: "dpo" });
    expect(secureGet("dailyData_2026-08-23")).toBeNull();
    expect(JSON.parse(secureGet("sessionHistory") ?? "[]")).toEqual([]);
    expect(JSON.parse(secureGet("guest_profiles") ?? "[]")).toEqual([]);
    expect(await loadNotes(MARIE)).toEqual([]);
  });

  it("keeps the access and purge logs as evidence of the end of contract", async () => {
    // Art. 28(3)(g): the processor deletes the data. It still has to be able to
    // show that it did.
    await eraseProperty({ actor: "dpo" });
    expect(getPurgeLog().length).toBeGreaterThan(0);
    expect(getAccessLog().length).toBeGreaterThan(0);
  });

  it("leaves device settings alone — they are not guest data", async () => {
    localStorage.setItem("app_settings", JSON.stringify({ costPerCover: 26 }));
    await eraseProperty({ actor: "dpo" });
    expect(localStorage.getItem("app_settings")).not.toBeNull();
  });
});
