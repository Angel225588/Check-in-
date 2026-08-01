/**
 * Guest notes — pure logic.
 *
 * No storage and no crypto in this file, so every rule below is testable
 * without a browser. Persistence lives in `notes-store.ts`, encryption in
 * `notes-crypto.ts`.
 *
 * The ordering rules here are safety rules, not cosmetics: a severe allergy
 * that sorts below three loyalty notes is an allergy nobody reads.
 */

export type NoteTone = "alert" | "preference" | "loyalty" | "event" | "info";

export const TONES: NoteTone[] = ["alert", "preference", "loyalty", "event", "info"];

export interface NoteRevision {
  at: string;
  author: string;
  summary: string;
}

export interface GuestNote {
  id: string;
  tone: NoteTone;
  title: string;
  body: string;
  pinned: boolean;
  author: string;
  createdAt: string;
  updatedAt: string;
  revisions: NoteRevision[];
}

export interface NoteInput {
  tone: NoteTone;
  title: string;
  body: string;
  author: string;
  pinned?: boolean;
}

/** Caps. Bodies are free text typed on a tablet; these keep one guest from
 *  eating the whole localStorage budget and starving the day's check-ins. */
export const MAX_TITLE = 80;
export const MAX_BODY = 2000;
export const MAX_NOTES_PER_GUEST = 60;
export const MAX_REVISIONS = 20;

/**
 * Alert and Event are the tones that change what reception *does* in the next
 * thirty seconds, so they surface themselves. Requiring someone to remember to
 * pin an allergy is a design that fails on the busy mornings it matters most.
 */
export function shouldPinByDefault(tone: NoteTone): boolean {
  return tone === "alert" || tone === "event";
}

function clamp(s: unknown, max: number): string {
  const str = typeof s === "string" ? s : "";
  return str.length > max ? str.slice(0, max) : str;
}

function safeTone(t: unknown): NoteTone {
  return TONES.includes(t as NoteTone) ? (t as NoteTone) : "info";
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeNote(input: NoteInput, opts: { now?: string; id?: string } = {}): GuestNote {
  const tone = safeTone(input.tone);
  const title = clamp(input.title, MAX_TITLE).trim();
  const body = clamp(input.body, MAX_BODY);
  if (!title.trim() && !body.trim()) {
    throw new Error("empty note");
  }
  const now = opts.now ?? new Date().toISOString();
  return {
    id: opts.id ?? newId(),
    tone,
    title,
    body,
    pinned: input.pinned ?? shouldPinByDefault(tone),
    author: typeof input.author === "string" ? clamp(input.author, 40) : "",
    createdAt: now,
    updatedAt: now,
    revisions: [],
  };
}

/**
 * Alerts first, then pinned, then most recent. An unpinned alert still
 * outranks a pinned preference — the tone carries the urgency, not the pin.
 */
function rank(n: GuestNote): number {
  if (n.tone === "alert") return 0;
  return n.pinned ? 1 : 2;
}

export function sortNotes(notes: GuestNote[]): GuestNote[] {
  return [...notes].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

/**
 * The chips shown on the check-in card itself, in the order they appear.
 *
 * There is no cap any more: the row scrolls sideways and carries every pinned
 * note. A cap needed the receptionist to notice a "+2" and decide to open a
 * panel; a scroller only needs a thumb.
 *
 * What the cap was protecting still holds, and now it is the only thing this
 * function guarantees: `sortNotes` puts alerts first, so the note that must not
 * be missed is the one already on screen before anyone scrolls.
 */
export function pinnedStrip(notes: GuestNote[]): GuestNote[] {
  return sortNotes(notes.filter((n) => n.pinned));
}

export function filterNotes(notes: GuestNote[], tone: NoteTone | "all"): GuestNote[] {
  const subset = tone === "all" ? notes : notes.filter((n) => n.tone === tone);
  return sortNotes(subset);
}

/**
 * Keep storage bounded. Sorted first, so what gets dropped is always the
 * least urgent and least recent — an alert is never the thing evicted.
 */
export function compactNotes(notes: GuestNote[]): GuestNote[] {
  return sortNotes(notes)
    .slice(0, MAX_NOTES_PER_GUEST)
    .map((n) => ({
      ...n,
      title: clamp(n.title, MAX_TITLE),
      body: clamp(n.body, MAX_BODY),
      revisions: (Array.isArray(n.revisions) ? n.revisions : []).slice(-MAX_REVISIONS),
    }));
}

const FIELD_LABEL: Record<string, string> = {
  title: "titre modifié",
  body: "texte modifié",
  tone: "ton modifié",
};

export function applyEdit(
  note: GuestNote,
  patch: Partial<Pick<GuestNote, "tone" | "title" | "body" | "pinned">>,
  author: string,
  opts: { now?: string } = {}
): GuestNote {
  const next: GuestNote = { ...note, revisions: [...note.revisions] };
  const changed: string[] = [];

  if (patch.tone !== undefined && safeTone(patch.tone) !== note.tone) {
    next.tone = safeTone(patch.tone);
    changed.push(FIELD_LABEL.tone);
  }
  if (patch.title !== undefined && clamp(patch.title, MAX_TITLE).trim() !== note.title) {
    next.title = clamp(patch.title, MAX_TITLE).trim();
    changed.push(FIELD_LABEL.title);
  }
  if (patch.body !== undefined && clamp(patch.body, MAX_BODY) !== note.body) {
    next.body = clamp(patch.body, MAX_BODY);
    changed.push(FIELD_LABEL.body);
  }
  if (patch.pinned !== undefined && patch.pinned !== note.pinned) {
    next.pinned = patch.pinned;
    changed.push(patch.pinned ? "épinglée" : "désépinglée");
  }

  // Nothing actually differs — do not manufacture an audit entry.
  if (changed.length === 0) return note;

  const now = opts.now ?? new Date().toISOString();
  next.updatedAt = now;
  next.revisions.push({ at: now, author: clamp(author, 40), summary: changed.join(", ") });
  return next;
}
