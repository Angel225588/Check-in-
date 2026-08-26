/**
 * Who accessed which guest's data, and when.
 *
 * Three properties give this module its shape:
 *
 *  1. **No names.** The subject is recorded as a salted hash of the guest
 *     identity, never the name. An access log listing guest names would be a
 *     second, unencrypted copy of the very data it audits — and it lives longer
 *     than the original, so it would be the worse copy.
 *  2. **Append-only.** There is no exported update or delete for an entry. A
 *     log the caller can rewrite is not a log. The only removal is the log's
 *     own retention prune.
 *  3. **Retained separately.** The guest-data purge does not touch it, and its
 *     window is longer (ACCESS_LOG_RETENTION_DAYS). "Who read this guest's
 *     allergy?" is normally asked after the guest record itself is gone.
 */
import { ACCESS_LOG_RETENTION_DAYS } from "./config";
import { guestIdentity } from "../guest-identity";

export const ACCESS_LOG_KEY = "access_log";

/** Bounded so a long-lived tablet cannot spend its whole quota on audit rows. */
const MAX_ENTRIES = 5000;

export type AccessAction =
  | "view" | "search" | "check-in" | "undo-check-in"
  | "note-read" | "note-write" | "export" | "erase" | "purge";

export interface AccessLogEntry {
  id: string;
  at: string;
  actor: string;
  action: AccessAction | string;
  resource: string;
  /** Salted hash of the guest identity, or "" when no single guest is involved. */
  subjectRef: string;
  roomNumber: string;
  detail: Record<string, unknown>;
}

export interface RecordAccessInput {
  actor: string;
  action: AccessAction | string;
  resource: string;
  guestName?: string;
  roomNumber?: string;
  detail?: Record<string, unknown>;
}

const SALT_KEY = "access_log_salt";

/**
 * Per-device salt. Guest names come from a finite set, so an unsalted digest
 * could be reversed by anyone holding a dump. Deliberately separate from the
 * notes salt: reusing it would let a leaked access log be joined against the
 * note store by key.
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

/** Stable pseudonym for a guest. Same person → same ref, across spellings. */
export async function subjectRef(guestName: string): Promise<string> {
  const identity = guestIdentity(guestName);
  if (!identity) return "";
  const material = `${deviceSalt()}|${identity}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  let hex = "";
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}

function read(): AccessLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCESS_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AccessLogEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: AccessLogEntry[]): void {
  try {
    localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(entries));
  } catch {
    // Quota. Drop the oldest half rather than lose the trail entirely — recent
    // accesses are the ones anyone asks about.
    try {
      localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch {
      /* nothing further without discarding the audit trail */
    }
  }
}

export function getAccessLog(): AccessLogEntry[] {
  return read();
}

export async function getAccessLogForGuest(guestName: string): Promise<AccessLogEntry[]> {
  const ref = await subjectRef(guestName);
  if (!ref) return [];
  return read().filter((e) => e.subjectRef === ref);
}

/** Drop entries past the log's own (longer) window. */
export function pruneAccessLog(nowIso: string = new Date().toISOString()): number {
  const cutoff = Date.parse(nowIso) - ACCESS_LOG_RETENTION_DAYS * 86_400_000;
  const all = read();
  const kept = all.filter((e) => {
    const t = Date.parse(e.at);
    // An unparseable timestamp is kept: an audit row of unknown age is
    // evidence, and silently discarding it is the wrong default for a log.
    return !Number.isFinite(t) || t >= cutoff;
  });
  if (kept.length !== all.length) write(kept);
  return all.length - kept.length;
}

export async function recordAccess(input: RecordAccessInput): Promise<void> {
  if (typeof localStorage === "undefined") return;
  const at = new Date().toISOString();
  const entry: AccessLogEntry = {
    id: `${Date.parse(at)}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    actor: input.actor || "unknown",
    action: input.action,
    resource: input.resource,
    subjectRef: input.guestName ? await subjectRef(input.guestName) : "",
    roomNumber: input.roomNumber ?? "",
    detail: input.detail ?? {},
  };
  write([...read(), entry].slice(-MAX_ENTRIES));
}
