import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  legacyGuestKey,
  migrateNotesToGuestIdentity,
  historicalGuestPairs,
  runNotesMigrationOnce,
  ensureNotesMigration,
  __resetMigrationMemo,
  MIGRATION_FLAG,
} from "@/lib/notes-migrate";
import { guestKey, loadNotes, addNote, NOTES_KEY_PREFIX } from "@/lib/notes-store";
import { encryptString, __resetKeyCache } from "@/lib/notes-crypto";
import { makeNote, type GuestNote } from "@/lib/notes";

beforeEach(() => {
  localStorage.clear();
  __resetKeyCache();
  __resetMigrationMemo();
  // Every tablet that ever stored a note has a device salt — the shipped app
  // minted one on the first write. Seeding it makes these fixtures a real
  // device rather than an impossible one, and the sweep rightly declines to
  // run on a device that has none.
  localStorage.setItem(`${NOTES_KEY_PREFIX}salt`, "a1b2c3d4e5f60718293a4b5c6d7e8f90");
});

/** Write a blob exactly the way the shipped app wrote it before this fix. */
async function seedLegacy(room: string, name: string, notes: GuestNote[]) {
  const env = await encryptString(JSON.stringify(notes));
  localStorage.setItem(NOTES_KEY_PREFIX + (await legacyGuestKey(room, name)), env);
}

const note = (title: string, over: Partial<GuestNote> = {}): GuestNote => ({
  ...makeNote({ tone: "alert", title, body: "b", author: "Réception" }),
  ...over,
});

/**
 * The notes Angel wrote are still on the tablet. They were never deleted —
 * only addressed to a room. The room number is recoverable from the 30 days of
 * session history the device already keeps, so the old address is recomputable
 * and the notes can be moved to where the guest will actually be looked up.
 */
describe("recovering notes written under the old room-scoped key", () => {
  it("finds a note written against a room and returns it under the guest", async () => {
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);

    // Nothing is readable yet — this is the bug, reproduced.
    expect(await loadNotes("SHEN, JIA")).toEqual([]);

    const report = await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "SHEN, JIA" }]);

    expect(report.notesRecovered).toBe(1);
    const back = await loadNotes("SHEN, JIA");
    expect(back).toHaveLength(1);
    expect(back[0].title).toBe("Allergie arachide");
  });

  it("recovers a note even when history spells the guest differently", async () => {
    // Written while the VIP list was on screen ("SHEN,JIA,Mrs"), recovered
    // from a history row that came off the roster ("SHEN, JIA").
    await seedLegacy("451", "SHEN,JIA,Mrs", [note("Chambre calme")]);
    await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "SHEN,JIA,Mrs" }]);
    expect((await loadNotes("SHEN, JIA"))[0].title).toBe("Chambre calme");
  });

  it("deletes the old key, so the orphan stops taking up room", async () => {
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);
    const legacy = NOTES_KEY_PREFIX + (await legacyGuestKey("451", "SHEN, JIA"));
    expect(localStorage.getItem(legacy)).not.toBeNull();

    await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "SHEN, JIA" }]);
    expect(localStorage.getItem(legacy)).toBeNull();
  });

  it("merges the same guest's notes from every room they ever had", async () => {
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);
    await seedLegacy("208", "SHEN, JIA", [note("Préfère étage haut")]);

    const report = await migrateNotesToGuestIdentity([
      { roomNumber: "451", name: "SHEN, JIA" },
      { roomNumber: "208", name: "SHEN, JIA" },
    ]);

    expect(report.notesRecovered).toBe(2);
    const titles = (await loadNotes("SHEN, JIA")).map((n) => n.title).sort();
    expect(titles).toEqual(["Allergie arachide", "Préfère étage haut"]);
  });

  it("keeps notes already written under the new key", async () => {
    await addNote("SHEN, JIA", { tone: "info", title: "Déjà là", body: "", author: "R" });
    await seedLegacy("451", "SHEN, JIA", [note("Ancienne")]);

    await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "SHEN, JIA" }]);

    const titles = (await loadNotes("SHEN, JIA")).map((n) => n.title).sort();
    expect(titles).toEqual(["Ancienne", "Déjà là"]);
  });
});

/**
 * A migration that runs on every app load must be safe to run on every app
 * load. Duplicating a guest's allergy note each morning would be its own bug.
 */
describe("running it twice changes nothing", () => {
  it("does not duplicate recovered notes", async () => {
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);
    const pairs = [{ roomNumber: "451", name: "SHEN, JIA" }];

    await migrateNotesToGuestIdentity(pairs);
    const second = await migrateNotesToGuestIdentity(pairs);

    expect(second.notesRecovered).toBe(0);
    expect(await loadNotes("SHEN, JIA")).toHaveLength(1);
  });

  it("keeps the newer version when the same note id appears twice", async () => {
    const base = note("Ancien titre");
    const newer: GuestNote = { ...base, title: "Titre corrigé", updatedAt: "2026-08-20T10:00:00.000Z" };
    const older: GuestNote = { ...base, title: "Ancien titre", updatedAt: "2026-08-01T10:00:00.000Z" };

    await seedLegacy("451", "SHEN, JIA", [newer]);
    await seedLegacy("208", "SHEN, JIA", [older]);

    await migrateNotesToGuestIdentity([
      { roomNumber: "451", name: "SHEN, JIA" },
      { roomNumber: "208", name: "SHEN, JIA" },
    ]);

    const back = await loadNotes("SHEN, JIA");
    expect(back).toHaveLength(1);
    expect(back[0].title).toBe("Titre corrigé");
  });
});

/**
 * Every failure here happens on a tablet at 06:40 with a queue. It must never
 * throw, never white-screen, and never destroy data it could not read.
 */
describe("it fails quietly and destroys nothing", () => {
  it("survives an unreadable blob and leaves it alone", async () => {
    const legacy = NOTES_KEY_PREFIX + (await legacyGuestKey("451", "SHEN, JIA"));
    localStorage.setItem(legacy, "not-an-envelope");

    const report = await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "SHEN, JIA" }]);

    expect(report.failed).toBe(1);
    // Undecipherable is not the same as worthless — a later fix might read it.
    expect(localStorage.getItem(legacy)).toBe("not-an-envelope");
  });

  it("keeps going after one bad blob", async () => {
    localStorage.setItem(NOTES_KEY_PREFIX + (await legacyGuestKey("451", "SHEN, JIA")), "broken");
    await seedLegacy("151", "WU, TUNG-AN", [note("Late check-out")]);

    const report = await migrateNotesToGuestIdentity([
      { roomNumber: "451", name: "SHEN, JIA" },
      { roomNumber: "151", name: "WU, TUNG-AN" },
    ]);

    expect(report.failed).toBe(1);
    expect(report.notesRecovered).toBe(1);
    expect((await loadNotes("WU, TUNG-AN"))[0].title).toBe("Late check-out");
  });

  it("leaves a guest with no legacy blob completely untouched", async () => {
    await addNote("WU, TUNG-AN", { tone: "info", title: "Intact", body: "", author: "R" });
    await migrateNotesToGuestIdentity([{ roomNumber: "999", name: "WU, TUNG-AN" }]);
    expect((await loadNotes("WU, TUNG-AN"))[0].title).toBe("Intact");
  });

  it("ignores a pair with no usable name instead of throwing", async () => {
    const report = await migrateNotesToGuestIdentity([{ roomNumber: "451", name: "  " }]);
    expect(report.failed).toBe(0);
    expect(report.notesRecovered).toBe(0);
  });
});

/**
 * The room numbers come from the device's own 30 days of history. Anything
 * older than that window is genuinely unrecoverable — which is the ceiling on
 * this recovery, not a decision we are making.
 */
describe("the rooms to look under come from the device's own history", () => {
  it("collects every room a guest occupied across the stored days", () => {
    localStorage.setItem(
      "sessionHistory",
      JSON.stringify([
        { date: "2026-08-19", clients: [{ roomNumber: "451", name: "SHEN, JIA" }], checkIns: [] },
        { date: "2026-08-10", clients: [{ roomNumber: "208", name: "SHEN, JIA" }], checkIns: [] },
      ])
    );
    const pairs = historicalGuestPairs();
    expect(pairs).toContainEqual({ roomNumber: "451", name: "SHEN, JIA" });
    expect(pairs).toContainEqual({ roomNumber: "208", name: "SHEN, JIA" });
  });

  it("includes today's not-yet-closed sheet", () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(
      `dailyData_${today}`,
      JSON.stringify({ date: today, clients: [{ roomNumber: "708", name: "QURIE, ZEINA" }], checkIns: [] })
    );
    expect(historicalGuestPairs()).toContainEqual({ roomNumber: "708", name: "QURIE, ZEINA" });
  });

  it("does not repeat a room+guest seen on many mornings", () => {
    localStorage.setItem(
      "sessionHistory",
      JSON.stringify([
        { date: "2026-08-19", clients: [{ roomNumber: "451", name: "SHEN, JIA" }], checkIns: [] },
        { date: "2026-08-18", clients: [{ roomNumber: "451", name: "SHEN, JIA" }], checkIns: [] },
      ])
    );
    expect(historicalGuestPairs()).toHaveLength(1);
  });

  it("survives a corrupted history without throwing", () => {
    localStorage.setItem("sessionHistory", "{{{not json");
    expect(() => historicalGuestPairs()).not.toThrow();
    expect(historicalGuestPairs()).toEqual([]);
  });
});

describe("the once-per-device guard", () => {
  it("runs the first time and marks itself done", async () => {
    localStorage.setItem(
      "sessionHistory",
      JSON.stringify([{ date: "2026-08-19", clients: [{ roomNumber: "451", name: "SHEN, JIA" }], checkIns: [] }])
    );
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);

    const first = await runNotesMigrationOnce();
    expect(first?.notesRecovered).toBe(1);
    expect(localStorage.getItem(MIGRATION_FLAG)).toBeTruthy();
  });

  it("does not scan again on the next load", async () => {
    localStorage.setItem(MIGRATION_FLAG, "done");
    expect(await runNotesMigrationOnce()).toBeNull();
  });
});

/**
 * React runs child effects before parent ones, so the guest screen's notes
 * hook can reach for the store before the app shell has even started the
 * recovery. Both go through one shared promise for that reason.
 */
describe("everyone waits on the same sweep", () => {
  it("runs the sweep only once however many callers ask", async () => {
    localStorage.setItem(
      "sessionHistory",
      JSON.stringify([{ date: "2026-08-19", clients: [{ roomNumber: "451", name: "SHEN, JIA" }], checkIns: [] }])
    );
    await seedLegacy("451", "SHEN, JIA", [note("Allergie arachide")]);

    // The hook and the shell, racing exactly as they do in the browser.
    const [a, b] = await Promise.all([ensureNotesMigration(), ensureNotesMigration()]);

    expect(a).toBe(b); // the same result object: one sweep, not two
    expect(a?.notesRecovered).toBe(1);
    expect(await loadNotes("SHEN, JIA")).toHaveLength(1);
  });

  it("resolves for a later caller without re-scanning", async () => {
    await ensureNotesMigration();
    expect(await ensureNotesMigration()).toBe(await ensureNotesMigration());
  });

  it("never rejects, so a caller can always await it", async () => {
    localStorage.setItem("sessionHistory", "{{{ not json");
    await expect(ensureNotesMigration()).resolves.not.toThrow();
  });
});
