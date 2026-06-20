// Durable mutation queue (the offline-first backbone).
// Every local mutation is enqueued here, then flushed to Supabase and only
// removed once the write is round-trip-verified. Survives reloads + crashes
// because it lives in localStorage, never in memory.

import type { Json } from "../database.types";

export type SyncEntity = "session" | "client" | "checkin" | "note";
export type SyncOp = "upsert" | "delete";

export interface Mutation {
  id: string;
  entity: SyncEntity;
  op: SyncOp;
  payload: Json;
  clientTs: number; // ms — used as tiebreaker context; server updated_at is authoritative for LWW
  tries: number;
  deviceId?: string;
}

const OUTBOX_KEY = "imarketin_sync_outbox";

function read(): Mutation[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Mutation[]) : [];
  } catch {
    return [];
  }
}

function write(items: Mutation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `m_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** Append a mutation to the queue. Returns the stored mutation (with id/clientTs/tries). */
export function enqueue(m: Omit<Mutation, "id" | "clientTs" | "tries">): Mutation {
  const full: Mutation = {
    ...m,
    id: newId(),
    clientTs: Date.now(),
    tries: 0,
  };
  const items = read();
  items.push(full);
  write(items);
  return full;
}

/** All queued mutations, FIFO. */
export function peekAll(): Mutation[] {
  return read();
}

/** Remove a mutation by id (call after a verified flush). */
export function remove(id: string): void {
  write(read().filter((m) => m.id !== id));
}

/** Increment the retry counter for a mutation (for backoff / poison detection). */
export function markTried(id: string): void {
  const items = read();
  const m = items.find((x) => x.id === id);
  if (m) {
    m.tries += 1;
    write(items);
  }
}

/** Empty the queue (tests / hard reset). */
export function clearOutbox(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OUTBOX_KEY);
}
