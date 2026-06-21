// Durable mutation queue (the offline-first backbone).
// Every local mutation is enqueued here, then flushed to Supabase and only
// removed once the write is round-trip-verified. Survives reloads + crashes
// because it lives in localStorage, never in memory.
//
// Concurrency: every mutating op re-reads fresh and operates by id-diff, so a
// UI enqueue interleaved with an async flush's remove() never loses a queued id.

import type { Json } from "../database.types";

export type SyncEntity = "session" | "client" | "checkin" | "note";
export type SyncOp = "upsert" | "delete";

export interface Mutation {
  id: string;
  entity: SyncEntity;
  op: SyncOp;
  rowId?: string; // target row's stable id (clients/checkins) — used for dedupe
  dedupeKey?: string; // `${entity}:${rowId}` — re-enqueue coalesces
  dirtyFields?: string[]; // fields edited (for pull-before-push rebase)
  serviceDate?: string; // owning service date (for hasPendingForDate gate)
  payload: Json;
  clientTs: number;
  tries: number;
  nextDueAt?: number; // backoff: not eligible to flush until this time
  lastError?: string;
  deviceId?: string;
}

const OUTBOX_KEY = "imarketin_sync_outbox";
const DEADLETTER_KEY = "imarketin_sync_deadletter";
export const MAX_TRIES = 8;

// Keys we may trim to free space under quota. NEVER the outbox, dead-letter, or
// the supabase auth-token key (losing those = lost mutations or lost session).
function isTrimmable(key: string): boolean {
  return key.startsWith("dailyData_") || key === "sessionHistory";
}

function readKey(key: string): Mutation[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Mutation[]) : [];
  } catch {
    return [];
  }
}

function read(): Mutation[] {
  return readKey(OUTBOX_KEY);
}

// Free space by blanking rawUploadText on stored days/history (allowlisted keys
// only). Never drops a queued mutation. Returns true if it freed anything.
function trimToFreeSpace(): boolean {
  let freed = false;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isTrimmable(k)) keys.push(k);
  }
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw || !/rawUploadText/.test(raw)) continue;
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj)) {
        for (const s of obj) if (s && s.rawUploadText) { s.rawUploadText = ""; freed = true; }
      } else if (obj && obj.rawUploadText) {
        obj.rawUploadText = ""; freed = true;
      }
      localStorage.setItem(k, JSON.stringify(obj));
    } catch {
      // skip
    }
  }
  return freed;
}

function writeKey(key: string, items: Mutation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    // QuotaExceededError: free space from allowlisted keys, then retry ONCE.
    // Never silently drop a queued mutation — surface failure if still stuck.
    if (trimToFreeSpace()) {
      localStorage.setItem(key, JSON.stringify(items)); // may throw -> surfaces to caller
    } else {
      throw e;
    }
  }
}

function write(items: Mutation[]): void {
  writeKey(OUTBOX_KEY, items);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Append a mutation. If a queued mutation shares its dedupeKey, coalesce:
 * keep one entry with the latest op/payload and the union of dirtyFields.
 */
export function enqueue(m: Omit<Mutation, "id" | "clientTs" | "tries">): Mutation {
  const items = read();
  const full: Mutation = { ...m, id: newId(), clientTs: Date.now(), tries: 0 };

  if (full.dedupeKey) {
    const idx = items.findIndex((x) => x.dedupeKey === full.dedupeKey);
    if (idx !== -1) {
      const prev = items[idx];
      const mergedDirty = Array.from(
        new Set([...(prev.dirtyFields ?? []), ...(full.dirtyFields ?? [])])
      );
      // keep the earlier id/clientTs (queue position), take latest op/payload
      const coalesced: Mutation = {
        ...full,
        id: prev.id,
        clientTs: prev.clientTs,
        tries: prev.tries,
        dirtyFields: mergedDirty.length ? mergedDirty : undefined,
      };
      items[idx] = coalesced;
      write(items);
      return coalesced;
    }
  }

  items.push(full);
  write(items);
  return full;
}

/** All queued mutations, FIFO. */
export function peekAll(): Mutation[] {
  return read();
}

/** Mutations eligible to flush now (no backoff pending), FIFO. */
export function peekDue(now: number): Mutation[] {
  return read().filter((m) => m.nextDueAt == null || m.nextDueAt <= now);
}

/** Remove a mutation by id (after a verified flush). Re-reads fresh (interleave-safe). */
export function remove(id: string): void {
  write(read().filter((m) => m.id !== id));
}

/** Increment retry counter. */
export function markTried(id: string): void {
  const items = read();
  const m = items.find((x) => x.id === id);
  if (m) {
    m.tries += 1;
    write(items);
  }
}

/** Schedule a retry: defer eligibility until an ABSOLUTE due-time + record the error. */
export function scheduleRetry(id: string, dueAt: number, err?: string): void {
  const items = read();
  const m = items.find((x) => x.id === id);
  if (m) {
    m.nextDueAt = dueAt;
    if (err) m.lastError = err;
    write(items);
  }
}

/** True if any queued mutation belongs to the given service date. */
export function hasPendingForDate(serviceDate: string): boolean {
  return read().some((m) => m.serviceDate === serviceDate);
}

/** Move a poisoned mutation out of the live queue into the dead-letter store. */
export function moveToDeadLetter(id: string): void {
  const items = read();
  const m = items.find((x) => x.id === id);
  if (!m) return;
  write(items.filter((x) => x.id !== id));
  const dl = readKey(DEADLETTER_KEY);
  dl.push(m);
  writeKey(DEADLETTER_KEY, dl);
}

export function deadLetters(): Mutation[] {
  return readKey(DEADLETTER_KEY);
}

/** Empty the queue (tests / hard reset). */
export function clearOutbox(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OUTBOX_KEY);
}
