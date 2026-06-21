// Flush engine: drain the outbox -> apply (upsert + verifyAfterWrite) -> remove.
// The control flow (remove on landed-proof, backoff on transient, dead-letter on
// config-error or max-tries) is decoupled from Supabase via the `apply` dependency
// so it is fully unit-testable; createSupabaseApply wires the real I/O.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { Client, CheckInRecord, DailyData } from "../types";
import {
  peekDue,
  remove,
  markTried,
  scheduleRetry,
  moveToDeadLetter,
  MAX_TRIES,
  type Mutation,
} from "./outbox";
import { verifyAfterWrite, VerifyError, ConfigError } from "../verify-after-write";
import { clientToRow, checkinToRow, sessionToRow } from "./mappers";

export interface FlushResult {
  flushed: number;
  retried: number;
  deadLettered: number;
}

export interface FlushDeps {
  apply: (m: Mutation) => Promise<void>;
  now?: () => number;
  backoffMs?: (tries: number) => number;
}

const defaultBackoff = (tries: number) => Math.min(5 * 60_000, 1000 * 2 ** (tries - 1));

let flushing = false;

/** Drain all currently-due mutations once. Single-flight (concurrent calls no-op). */
export async function flushOnce(deps: FlushDeps): Promise<FlushResult> {
  if (flushing) return { flushed: 0, retried: 0, deadLettered: 0 };
  flushing = true;
  try {
    const now = deps.now?.() ?? Date.now();
    const backoff = deps.backoffMs ?? defaultBackoff;
    let flushed = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const m of peekDue(now)) {
      try {
        await deps.apply(m);
        remove(m.id); // only after a landed-proof
        flushed++;
      } catch (e) {
        if (e instanceof ConfigError) {
          // RLS / tenant mismatch — never retry; surface via dead-letter.
          moveToDeadLetter(m.id);
          deadLettered++;
          continue;
        }
        markTried(m.id);
        const triesNow = m.tries + 1;
        if (triesNow >= MAX_TRIES) {
          moveToDeadLetter(m.id);
          deadLettered++;
        } else {
          scheduleRetry(m.id, now + backoff(triesNow), e instanceof Error ? e.message : String(e));
          retried++;
        }
      }
    }
    return { flushed, retried, deadLettered };
  } finally {
    flushing = false;
  }
}

function classify(error: { code?: string; message: string }): never {
  if (error.code === "42501") throw new ConfigError(error.message);
  throw new VerifyError(error.message);
}

/** Wire the real Supabase I/O. locationId is read live (never enqueue-time). */
export function createSupabaseApply(
  sb: SupabaseClient<Database>,
  getLocationId: () => string
): (m: Mutation) => Promise<void> {
  return async (m: Mutation): Promise<void> => {
    const locationId = getLocationId();
    if (!locationId) throw new ConfigError("no location in session");

    if (m.entity === "client") {
      const c = m.payload as unknown as Client & { __sessionId?: string | null };
      const row = clientToRow(c, { locationId, sessionId: c.__sessionId ?? null });
      const rev = row.client_rev ?? 0;
      if (m.op === "delete") {
        const { error } = await sb
          .from("clients")
          .update({ deleted_at: new Date().toISOString(), client_rev: rev })
          .eq("id", row.id as string);
        if (error) classify(error);
        await verifyAfterWrite(sb, { table: "clients", id: row.id as string, ourRev: rev, expectDeleted: true });
      } else {
        const { error } = await sb.from("clients").upsert(row, { onConflict: "id" });
        if (error) classify(error);
        await verifyAfterWrite(sb, { table: "clients", id: row.id as string, ourRev: rev });
      }
      return;
    }

    if (m.entity === "checkin") {
      const ci = m.payload as unknown as CheckInRecord & { __sessionId?: string | null };
      const row = checkinToRow(ci, { locationId, sessionId: ci.__sessionId ?? null });
      const rev = row.client_rev ?? 0;
      if (m.op === "delete") {
        const { error } = await sb
          .from("checkins")
          .update({ deleted_at: new Date().toISOString(), client_rev: rev })
          .eq("id", row.id as string);
        if (error) classify(error);
        await verifyAfterWrite(sb, { table: "checkins", id: row.id as string, ourRev: rev, expectDeleted: true });
      } else {
        const { error } = await sb.from("checkins").upsert(row, { onConflict: "id" });
        if (error) classify(error);
        await verifyAfterWrite(sb, { table: "checkins", id: row.id as string, ourRev: rev });
      }
      return;
    }

    if (m.entity === "session") {
      const d = m.payload as unknown as DailyData & { __status?: string; __totals?: Record<string, unknown>; __closedAt?: string | null };
      const row = sessionToRow(d, { locationId }, { status: d.__status, totals: d.__totals, closedAt: d.__closedAt });
      const rev = row.client_rev ?? 0;
      const { error } = await sb.from("sessions").upsert(row, { onConflict: "location_id,service_date" });
      if (error) classify(error);
      await verifyAfterWrite(sb, {
        table: "sessions",
        match: { location_id: locationId, service_date: d.date },
        ourRev: rev,
      });
      return;
    }
  };
}
