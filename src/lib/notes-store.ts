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

export const NOTES_KEY_PREFIX = "gn_";
const SALT_KEY = `${NOTES_KEY_PREFIX}salt`;

/**
 * A per-device salt. Room numbers are 3-4 digits and guest names come from a
 * finite list, so an unsalted digest could be brute-forced by anyone holding a
 * dump. The salt makes that work device-specific rather than reusable. It is
 * stored beside the data, so it does not hide anything from someone who
 * already has the device — the encryption is what protects the content.
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

/** Match the name normalisation the rest of the app already uses. */
function normName(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function guestKey(roomNumber: string, name: string): Promise<string> {
  const material = `${deviceSalt()}|${String(roomNumber ?? "").trim()}|${normName(name)}`;
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

export async function loadNotes(roomNumber: string, name: string): Promise<GuestNote[]> {
  if (typeof localStorage === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(NOTES_KEY_PREFIX + (await guestKey(roomNumber, name)));
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
async function persist(roomNumber: string, name: string, notes: GuestNote[]): Promise<GuestNote[]> {
  const compacted = compactNotes(notes);
  const envelope = await encryptString(JSON.stringify(compacted));
  localStorage.setItem(NOTES_KEY_PREFIX + (await guestKey(roomNumber, name)), envelope);
  return compacted;
}

export async function addNote(roomNumber: string, name: string, input: NoteInput): Promise<GuestNote[]> {
  const current = await loadNotes(roomNumber, name);
  return persist(roomNumber, name, [...current, makeNote(input)]);
}

export async function updateNote(
  roomNumber: string,
  name: string,
  id: string,
  patch: Partial<Pick<GuestNote, "tone" | "title" | "body" | "pinned">>,
  author: string
): Promise<GuestNote[]> {
  const current = await loadNotes(roomNumber, name);
  const next = current.map((n) => (n.id === id ? applyEdit(n, patch, author) : n));
  return persist(roomNumber, name, next);
}

export async function togglePin(
  roomNumber: string,
  name: string,
  id: string,
  author: string
): Promise<GuestNote[]> {
  const current = await loadNotes(roomNumber, name);
  const target = current.find((n) => n.id === id);
  if (!target) return current;
  return updateNote(roomNumber, name, id, { pinned: !target.pinned }, author);
}

export async function deleteNote(roomNumber: string, name: string, id: string): Promise<GuestNote[]> {
  const current = await loadNotes(roomNumber, name);
  const next = current.filter((n) => n.id !== id);
  if (next.length === current.length) return current;
  return persist(roomNumber, name, next);
}
