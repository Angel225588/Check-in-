// Pull + merge: bring remote changes into local with deterministic LWW + tombstones.
// Pure merge functions (testable) + thin pullSince fetchers (live).
//
// Conflict order (identical on every device):
//   1. greater client_rev wins
//   2. tie on rev -> a delete (tombstone) wins over an edit
//   3. still tied -> lexically greater device_id wins
// A row with a pending local outbox mutation is NOT overwritten by the server
// (local intent wins until it flushes). A confirmed server tombstone REMOVES the
// local row; a tombstone for a row we never had is ignored. Local deletes splice
// locally and sync as a delete mutation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { Client, CheckInRecord } from "../types";
import { rowToClient, rowToCheckin } from "./mappers";

interface LwwFields {
  clientRev?: number;
  deletedAt?: string | null;
  deviceId?: string;
}

/** True if the server row should overwrite the local row under LWW. */
export function lwwServerWins(s: LwwFields, l: LwwFields): boolean {
  const sr = s.clientRev ?? 0;
  const lr = l.clientRev ?? 0;
  if (sr !== lr) return sr > lr;
  const sd = !!s.deletedAt;
  const ld = !!l.deletedAt;
  if (sd !== ld) return sd; // delete beats edit at equal rev
  return (s.deviceId ?? "") > (l.deviceId ?? ""); // total order tiebreak
}

/**
 * Merge server clients into local.
 * - existing id: server wins per LWW (unless a local outbox mutation is pending)
 * - first-contact: a local-only (unsynced) row with the same content key adopts
 *   the server id instead of duplicating
 * - new server row: appended (tombstoned rows kept, filtered from UI later)
 */
export function mergePulledClients(
  local: Client[],
  incoming: Client[],
  pendingIds: Set<string>
): Client[] {
  const byId = new Map<string, Client>();
  for (const c of local) byId.set(c.id ?? "", c);

  // index local rows that have NOT yet been confirmed on the server, by content key
  const localOnlyByKey = new Map<string, Client>();
  for (const c of local) {
    if (!c.serverUpdatedAt && c.clientLocalKey) localOnlyByKey.set(c.clientLocalKey, c);
  }

  for (const s of incoming) {
    const sid = s.id ?? "";
    const existing = byId.get(sid);

    if (existing) {
      if (pendingIds.has(sid)) continue; // our queued change wins until flushed
      if (lwwServerWins(s, existing)) {
        if (s.deletedAt) byId.delete(sid); // confirmed server delete -> remove locally
        else byId.set(sid, { ...existing, ...s });
      }
      continue;
    }

    if (s.deletedAt) continue; // tombstone for a row we don't have -> nothing to do

    // first-contact adoption (avoid duplicate of the same guest created on 2 devices)
    const key = s.clientLocalKey;
    if (key && localOnlyByKey.has(key)) {
      const localRow = localOnlyByKey.get(key)!;
      if (pendingIds.has(localRow.id ?? "")) continue; // our push will create the row; don't double
      byId.delete(localRow.id ?? "");
      byId.set(sid, { ...localRow, ...s });
      localOnlyByKey.delete(key);
      continue;
    }

    byId.set(sid, s); // brand-new server row
  }

  return Array.from(byId.values());
}

/** Merge server check-ins into local (append-only events; LWW for edits/tombstones). */
export function mergePulledCheckins(
  local: CheckInRecord[],
  incoming: CheckInRecord[],
  pendingIds: Set<string>
): CheckInRecord[] {
  const byId = new Map<string, CheckInRecord>();
  for (const c of local) byId.set(c.id, c);

  for (const s of incoming) {
    const existing = byId.get(s.id);
    if (existing) {
      if (pendingIds.has(s.id)) continue;
      if (lwwServerWins(s, existing)) {
        if (s.deletedAt) byId.delete(s.id); // confirmed server delete -> remove locally
        else byId.set(s.id, { ...existing, ...s });
      }
    } else if (!s.deletedAt) {
      byId.set(s.id, s);
    }
  }

  return Array.from(byId.values());
}

// ---- live fetchers (exercised against real Supabase) ----

export async function pullClientsSince(
  sb: SupabaseClient<Database>,
  locationId: string,
  sinceIso: string
): Promise<Client[]> {
  const { data, error } = await sb
    .from("clients")
    .select("*")
    .eq("location_id", locationId)
    .gt("updated_at", sinceIso)
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToClient);
}

export async function pullCheckinsSince(
  sb: SupabaseClient<Database>,
  locationId: string,
  sinceIso: string
): Promise<CheckInRecord[]> {
  const { data, error } = await sb
    .from("checkins")
    .select("*")
    .eq("location_id", locationId)
    .gt("updated_at", sinceIso)
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCheckin);
}
