/**
 * Notes carry allergies, so they are the most sensitive thing the app stores
 * and the thing it can least afford to lose by accident. Retention has to
 * reach them — they were previously kept forever — without ever deleting one
 * because of a storage-format change.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { addNote, loadNotes, NOTES_KEY_PREFIX, guestKey } from "@/lib/notes-store";
import { encryptString, __resetKeyCache } from "@/lib/notes-crypto";
import { purgeExpired } from "@/lib/privacy/purge";

const GUEST = "DUPONT, Marie";

beforeEach(() => {
  __resetKeyCache();
  localStorage.clear();
});

describe("note envelopes carry a plaintext date", () => {
  it("stores a touchedAt date outside the ciphertext", async () => {
    await addNote(GUEST, { tone: "alert", title: "Allergie arachide", body: "sévère", author: "reception" });
    const raw = localStorage.getItem(NOTES_KEY_PREFIX + (await guestKey(GUEST)))!;
    const envelope = JSON.parse(raw);
    expect(envelope.touchedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("keeps the note body out of that plaintext", async () => {
    // The date is metadata; the allergy is not. Putting the wrong one in the
    // clear would undo the encryption this store exists for.
    await addNote(GUEST, { tone: "alert", title: "Allergie arachide", body: "sévère", author: "reception" });
    const raw = localStorage.getItem(NOTES_KEY_PREFIX + (await guestKey(GUEST)))!;
    expect(raw).not.toMatch(/arachide|sévère|reception/i);
  });

  it("still reads a legacy bare-ciphertext envelope", async () => {
    // Notes written before this change are a bare "v.iv.ct" string, not JSON.
    const legacy = await encryptString(JSON.stringify([{
      id: "1", tone: "alert", title: "Allergie", body: "arachide", pinned: true,
      author: "reception", createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", revisions: [],
    }]));
    localStorage.setItem(NOTES_KEY_PREFIX + (await guestKey(GUEST)), legacy);
    const notes = await loadNotes(GUEST);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("arachide");
  });
});

describe("purge reaches notes", () => {
  it("removes a note envelope older than the window", async () => {
    const key = NOTES_KEY_PREFIX + (await guestKey(GUEST));
    await addNote(GUEST, { tone: "info", title: "vieux", body: "x", author: "r" });
    const env = JSON.parse(localStorage.getItem(key)!);
    env.touchedAt = "2020-01-01T00:00:00.000Z";
    localStorage.setItem(key, JSON.stringify(env));

    await purgeExpired({ todayIso: "2026-08-23", days: 90 });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("keeps a recent note", async () => {
    const key = NOTES_KEY_PREFIX + (await guestKey(GUEST));
    await addNote(GUEST, { tone: "alert", title: "Allergie", body: "arachide", author: "r" });
    await purgeExpired({ todayIso: new Date().toISOString().split("T")[0], days: 90 });
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it("keeps a legacy envelope, which has no date to judge it by", async () => {
    // Deleting an allergy because of a storage-format upgrade is the worst
    // outcome available here. Undated means kept.
    const key = NOTES_KEY_PREFIX + (await guestKey(GUEST));
    localStorage.setItem(key, await encryptString(JSON.stringify([])));
    await purgeExpired({ todayIso: "2026-08-23", days: 90 });
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it("never deletes the device salt", async () => {
    await addNote(GUEST, { tone: "info", title: "t", body: "b", author: "r" });
    await purgeExpired({ todayIso: "2026-08-23", days: 90 });
    expect(localStorage.getItem(`${NOTES_KEY_PREFIX}salt`)).not.toBeNull();
  });
});
