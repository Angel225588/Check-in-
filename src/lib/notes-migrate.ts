/**
 * One-time recovery of notes written under the old room-scoped key.
 *
 * Until this fix a note's address was `salt + room + name`. Reception wrote
 * "allergie arachide" against room 451; the guest came back in 208; the app
 * hashed a different string, found nothing, and showed an empty panel. The
 * note was never deleted — `closeDay` does not touch the `gn_` prefix, and
 * nothing else does either. It was simply addressed to a room, and rooms do
 * not come back.
 *
 * The old address is recomputable: the salt is still on the device, and the
 * rooms are in the 30 days of session history the device already keeps. So we
 * can walk every (room, guest) pair the tablet has ever recorded, look under
 * the old address, and move whatever is there to the guest.
 *
 * What this cannot reach: a guest whose stay has already aged out of the
 * 30-day window. That is the ceiling on the recovery, not a choice — there is
 * no record left of which room to look under.
 *
 * Silence is deliberate throughout, exactly as in `notes-store`: a console
 * line carrying a note body would undo the encryption it took to store it.
 */

import { GuestNote, compactNotes } from "./notes";
import { encryptString, decryptString } from "./notes-crypto";
import { wrapEnvelope, unwrapEnvelope } from "./note-envelope";
import { guestIdentity } from "./guest-identity";
import { NOTES_KEY_PREFIX, guestKey } from "./notes-store";

/** Set once the sweep has completed, so it does not re-scan on every load. */
export const MIGRATION_FLAG = `${NOTES_KEY_PREFIX}migrated_guest_identity`;

const SALT_KEY = `${NOTES_KEY_PREFIX}salt`;

export interface MigrationReport {
  /** (room, guest) pairs examined. */
  pairs: number;
  /** Legacy blobs actually found under an old key. */
  blobsFound: number;
  /** Notes moved to a guest key. */
  notesRecovered: number;
  /** Distinct guests who got notes back. */
  guests: number;
  /** Blobs that could not be read; left in place, never destroyed. */
  failed: number;
}

const empty = (): MigrationReport => ({ pairs: 0, blobsFound: 0, notesRecovered: 0, guests: 0, failed: 0 });

/** Read the salt WITHOUT creating one. A device with no salt has no notes. */
function existingSalt(): string | null {
  try {
    return localStorage.getItem(SALT_KEY);
  } catch {
    return null;
  }
}

/** The name normalisation the OLD key used. Frozen here on purpose: it is a
 *  historical fact about bytes already on disk, not a rule we still follow. */
function legacyNormName(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Recompute an address the shipped app used to write to.
 *
 * Kept byte-for-byte identical to the retired `guestKey(room, name)`. If this
 * drifts, the notes stop being findable and the recovery silently does
 * nothing — which is why `notes-migrate.test.ts` seeds through this function
 * and reads back through the real store.
 */
export async function legacyGuestKey(roomNumber: string, name: string): Promise<string> {
  const salt = existingSalt() ?? "no-store";
  const material = `${salt}|${String(roomNumber ?? "").trim()}|${legacyNormName(name)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}

function isNoteish(v: unknown): v is GuestNote {
  return !!v && typeof v === "object" && typeof (v as GuestNote).id === "string";
}

async function readBlob(key: string): Promise<GuestNote[] | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  const plain = await decryptString(unwrapEnvelope(raw));
  if (plain === null) return null;
  try {
    const parsed: unknown = JSON.parse(plain);
    return Array.isArray(parsed) ? parsed.filter(isNoteish) : null;
  } catch {
    return null;
  }
}

/**
 * Combine two sets of notes, one entry per id.
 *
 * The same note can exist in two rooms' blobs — the guest stayed twice and the
 * note was edited in between. The later `updatedAt` is the one reception last
 * saw, so it wins.
 */
function mergeById(a: GuestNote[], b: GuestNote[]): GuestNote[] {
  const byId = new Map<string, GuestNote>();
  for (const n of [...a, ...b]) {
    const prev = byId.get(n.id);
    if (!prev || (n.updatedAt || "") > (prev.updatedAt || "")) byId.set(n.id, n);
  }
  return [...byId.values()];
}

/**
 * Move every legacy blob named by `pairs` onto its guest key.
 *
 * Idempotent: a legacy key is removed only after its notes are safely written,
 * so a second run finds nothing and reports zero. A blob that cannot be
 * decrypted is counted as failed and LEFT WHERE IT IS — unreadable today is
 * not the same as worthless, and deleting it would end the story for good.
 */
export async function migrateNotesToGuestIdentity(
  pairs: Array<{ roomNumber: string; name: string }>
): Promise<MigrationReport> {
  const report = empty();
  if (typeof localStorage === "undefined") return report;
  // No salt means nothing was ever written on this device.
  if (!existingSalt()) return report;

  const touched = new Set<string>();

  for (const pair of pairs) {
    if (!guestIdentity(pair.name)) continue; // nameless row — nothing to key on
    report.pairs++;

    let legacyKey: string;
    try {
      legacyKey = NOTES_KEY_PREFIX + (await legacyGuestKey(pair.roomNumber, pair.name));
    } catch {
      continue;
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(legacyKey);
    } catch {
      continue;
    }
    if (!raw) continue;

    report.blobsFound++;

    const legacyNotes = await readBlob(legacyKey);
    if (legacyNotes === null) {
      report.failed++;
      continue;
    }

    try {
      const destKey = NOTES_KEY_PREFIX + (await guestKey(pair.name));
      // A guest can be their own destination when the identity happens to
      // hash to the legacy key — impossible in practice, cheap to rule out.
      if (destKey === legacyKey) continue;

      const existing = (await readBlob(destKey)) ?? [];
      const before = existing.length;
      const merged = compactNotes(mergeById(existing, legacyNotes));

      localStorage.setItem(destKey, wrapEnvelope(await encryptString(JSON.stringify(merged))));
      // Only now is it safe to drop the old address.
      localStorage.removeItem(legacyKey);

      const gained = merged.length - before;
      if (gained > 0) {
        report.notesRecovered += gained;
        touched.add(destKey);
      }
    } catch {
      // Quota, crypto, anything. The legacy blob stays put for the next try.
      report.failed++;
    }
  }

  report.guests = touched.size;
  return report;
}

/**
 * Every (room, guest) the device can still remember.
 *
 * Both the closed days and this morning's open sheet — a note written at 07:00
 * today is exactly the one reception would notice missing first.
 */
export function historicalGuestPairs(): Array<{ roomNumber: string; name: string }> {
  if (typeof localStorage === "undefined") return [];
  const seen = new Set<string>();
  const out: Array<{ roomNumber: string; name: string }> = [];

  const add = (roomNumber: unknown, name: unknown) => {
    if (typeof roomNumber !== "string" || typeof name !== "string") return;
    const key = `${roomNumber}::${guestIdentity(name)}`;
    if (!guestIdentity(name) || seen.has(key)) return;
    seen.add(key);
    out.push({ roomNumber, name });
  };

  const scan = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const clients = (v as { clients?: unknown }).clients;
    if (!Array.isArray(clients)) return;
    for (const c of clients) {
      if (c && typeof c === "object") {
        add((c as { roomNumber?: unknown }).roomNumber, (c as { name?: unknown }).name);
      }
    }
  };

  try {
    const raw = localStorage.getItem("sessionHistory");
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(scan);
    }
  } catch {
    /* a corrupted history must not stop today's sheet being scanned */
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("dailyData_")) continue;
      const raw = localStorage.getItem(key);
      if (raw) scan(JSON.parse(raw));
    }
  } catch {
    /* same */
  }

  return out;
}

/**
 * The sweep, started at most once per page load and shared by every caller.
 *
 * Both the app shell and the notes hook need it: the shell so it happens early
 * on a device that has been sitting idle, the hook so that a guest screen
 * opened before it finished does not read an empty store and show a blank
 * panel until someone reloads. React runs child effects BEFORE parent ones, so
 * the guest screen genuinely can get there first — the shell cannot be relied
 * on to have started it.
 */
let migrationPromise: Promise<MigrationReport | null> | null = null;

export function ensureNotesMigration(): Promise<MigrationReport | null> {
  if (!migrationPromise) {
    migrationPromise = runNotesMigrationOnce().catch(() => null);
  }
  return migrationPromise;
}

/** Tests only: forget that the sweep already ran this session. */
export function __resetMigrationMemo(): void {
  migrationPromise = null;
}

/**
 * Run the sweep once per device, on app load.
 *
 * Returns null when it has already run. The flag is set even for a device with
 * nothing to recover: the cost of the sweep is a SHA-256 per stored room, and
 * there is no reason to pay it every morning forever.
 */
export async function runNotesMigrationOnce(): Promise<MigrationReport | null> {
  if (typeof localStorage === "undefined") return null;
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return null;
  } catch {
    return null;
  }

  const report = await migrateNotesToGuestIdentity(historicalGuestPairs());

  try {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
  } catch {
    // Storage full: the sweep is idempotent, so running again tomorrow is
    // harmless. Better to repeat work than to lose the day's check-ins.
  }
  return report;
}
