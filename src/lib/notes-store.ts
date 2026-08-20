/**
 * Persistence for guest notes.
 *
 * Two separate leaks are being closed here:
 *
 *  1. The *value* — encrypted (see `notes-crypto.ts`).
 *  2. The *key* — a localStorage key of `notes_524_POLANCO` would hand over
 *     the guest list to anyone who opens devtools, no matter how well the
 *     value is encrypted. Keys are therefore a salted SHA-256 digest.
 *
 * Every failure path in this file is deliberately silent. A `console.error`
 * carrying a note body would undo the encryption by writing the plaintext
 * somewhere far easier to read.
 */

import {
  GuestNote,
  NoteInput,
  NoteTone,
  makeNote,
  applyEdit,
  compactNotes,
  sortNotes,
  TONES,
} from "./notes";
import { encryptString, decryptString } from "./notes-crypto";
import { guestIdentity } from "./guest-identity";

export const NOTES_KEY_PREFIX = "gn_";
const SALT_KEY = `${NOTES_KEY_PREFIX}salt`;

/**
 * A per-device salt. Guest names come from a finite list, so an unsalted
 * digest could be brute-forced by anyone holding a dump. The salt makes that
 * work device-specific rather than reusable. It is stored beside the data, so
 * it does not hide anything from someone who already has the device — the
 * encryption is what protects the content.
 */
function deviceSalt(): string {
  if (typeof localStorage === "undefined") return "no-store";
  try {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    localStorage.setItem(SALT_KEY, hex);
    return hex;
  } catch {
    return "no-store";
  }
}

/**
 * Where a guest's notes live.
 *
 * The room number is deliberately absent. It used to be in here, and that is
 * exactly what made notes disappear: reception writes "allergie arachide"
 * against room 451 tonight, the guest returns in 208 next month, the app
 * computes a different key and finds nothing. The note was never deleted — it
 * was addressed to a room, and rooms do not come back.
 *
 * `guestIdentity` is the app's one definition of the same person, shared with
 * arrival habits, so the two cannot drift apart.
 */
export async function guestKey(name: string): Promise<string> {
  const identity = guestIdentity(name);
  if (!identity) throw new Error("no guest identity");
  const material = `${deviceSalt()}|${identity}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}

function isNote(v: unknown): v is GuestNote {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.body === "string" &&
    typeof o.pinned === "boolean" &&
    typeof o.createdAt === "string" &&
    typeof o.updatedAt === "string" &&
    TONES.includes(o.tone as NoteTone)
  );
}

export async function loadNotes(name: string): Promise<GuestNote[]> {
  if (typeof localStorage === "undefined") return [];
  let raw: string | null = null;
  try {
    // A guest with no usable name has no notes. Returning [] rather than
    // reading a shared bucket keeps one nameless row from showing another's.
    raw = localStorage.getItem(NOTES_KEY_PREFIX + (await guestKey(name)));
  } catch {
    return [];
  }
  if (!raw) return [];

  const plain = await decryptString(raw);
  if (plain === null) return [];

  try {
    const parsed: unknown = JSON.parse(plain);
    if (!Array.isArray(parsed)) return [];
    // Drop anything that is not a well-formed note rather than letting a
    // hand-edited or partially-written blob crash the check-in screen.
    return sortNotes(
      parsed.filter(isNote).map((n) => ({ ...n, revisions: Array.isArray(n.revisions) ? n.revisions : [] }))
    );
  } catch {
    return [];
  }
}

/**
 * Throws when the write does not land. The check-in screen already learned
 * this lesson: a UI that says "saved" when nothing was saved is worse than one
 * that admits the failure.
 */
async function persist(name: string, notes: GuestNote[]): Promise<GuestNote[]> {
  // Resolve the key BEFORE compacting, so a nameless guest throws instead of
  // silently writing somewhere shared.
  const key = NOTES_KEY_PREFIX + (await guestKey(name));
  const compacted = compactNotes(notes);
  const envelope = await encryptString(JSON.stringify(compacted));
  localStorage.setItem(key, envelope);
  return compacted;
}

export async function addNote(name: string, input: NoteInput): Promise<GuestNote[]> {
  const current = await loadNotes(name);
  return persist(name, [...current, makeNote(input)]);
}

export async function updateNote(
  name: string,
  id: string,
  patch: Partial<Pick<GuestNote, "tone" | "title" | "body" | "pinned">>,
  author: string
): Promise<GuestNote[]> {
  const current = await loadNotes(name);
  const next = current.map((n) => (n.id === id ? applyEdit(n, patch, author) : n));
  return persist(name, next);
}

export async function togglePin(
  name: string,
  id: string,
  author: string
): Promise<GuestNote[]> {
  const current = await loadNotes(name);
  const target = current.find((n) => n.id === id);
  if (!target) return current;
  return updateNote(name, id, { pinned: !target.pinned }, author);
}

export async function deleteNote(name: string, id: string): Promise<GuestNote[]> {
  const current = await loadNotes(name);
  const next = current.filter((n) => n.id !== id);
  if (next.length === current.length) return current;
  return persist(name, next);
}
