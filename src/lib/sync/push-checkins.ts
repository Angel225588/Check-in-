// Sync v2 — cross-device check-in state.
// Check-in events sync by their own immutable `id` (idempotent upsert). PII
// (guest name, room) is encrypted on-device with the access-code-derived key —
// the server stores only ciphertext it cannot read. Undo is a sticky tombstone
// (`deleted_at`). The point of this module: device B's `remaining`/`allDone`
// reflects device A's check-in, so the existing guard blocks the duplicate.
import type { CheckInRecord } from "../types";
import { getSupabase } from "../supabase";
import { cachedLocation } from "./session";
import { getTodayData, applyServerCheckins } from "../storage";
import { getDeviceId } from "./config";
import { storedSyncCode, ensureSession } from "./push-day";
import { locationKeys } from "./keys";
import { encryptField, decryptField } from "../crypto/field-crypto";

async function tryDecrypt(dek: CryptoKey, v: string): Promise<string> {
  if (!v) return "";
  try {
    return await decryptField(dek, v);
  } catch {
    return v; // legacy plaintext or wrong key — show as-is
  }
}

/**
 * Encrypt + upsert today's local check-ins (idempotent on `id`).
 * Round-trip-verified: after the write we read the same ids back and assert they
 * landed, so a silent RLS/network drop surfaces as a thrown failure (never a fake OK).
 */
export async function syncCheckinsToSupabase(code: string): Promise<{ pushed: number }> {
  const loc = cachedLocation();
  if (!loc) throw new Error("not_connected");

  const checkIns = getTodayData()?.checkIns ?? [];
  if (checkIns.length === 0) return { pushed: 0 };

  const { dek } = await locationKeys(code);
  const deviceId = getDeviceId();

  const rows = await Promise.all(
    checkIns.map(async (c) => ({
      id: c.id, // CheckInRecord uuid → same id on every device = idempotent
      location_id: loc.locationId,
      room_number: await encryptField(dek, c.roomNumber || ""), // PII → ciphertext
      client_name: await encryptField(dek, c.clientName || ""), // PII → ciphertext
      people_entered: c.peopleEntered || 0,
      payment_action: c.paymentAction || null,
      checked_in_at: c.timestamp,
      device_id: deviceId,
      deleted_at: null, // re-asserting a live record (undo is a separate tombstone path)
    })),
  );

  const { error } = await getSupabase()
    .from("checkins")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);

  // Round-trip-or-fail: prove the rows are live on the server before claiming success.
  const ids = rows.map((r) => r.id);
  const { data: back, error: readErr } = await getSupabase()
    .from("checkins")
    .select("id")
    .in("id", ids)
    .is("deleted_at", null);
  if (readErr) throw new Error(readErr.message);
  if ((back?.length ?? 0) < ids.length) {
    throw new Error(`checkin_sync_unverified: wrote ${ids.length}, read ${back?.length ?? 0}`);
  }
  return { pushed: rows.length };
}

/** Mark a check-in undone on the server (sticky tombstone). No-op if it never synced. */
export async function pushCheckinTombstone(id: string): Promise<void> {
  const loc = cachedLocation();
  if (!loc) return;
  const { error } = await getSupabase()
    .from("checkins")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("location_id", loc.locationId);
  if (error) throw new Error(error.message);
}

/**
 * Pull the location's check-ins, decrypt PII on-device, and reconcile into today's
 * session: live rows device B didn't have get added; tombstoned rows get removed.
 */
export async function pullCheckinsFromSupabase(code: string): Promise<{ pulled: number }> {
  const loc = cachedLocation();
  if (!loc) throw new Error("not_connected");
  const { dek } = await locationKeys(code);

  const { data, error } = await getSupabase().from("checkins").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    applyServerCheckins([], []);
    return { pulled: 0 };
  }

  const str = (g: Record<string, unknown>, k: string) =>
    typeof g[k] === "string" ? (g[k] as string) : "";
  const num = (g: Record<string, unknown>, k: string) =>
    typeof g[k] === "number" ? (g[k] as number) : 0;

  const deletedIds: string[] = [];
  const liveRows = rows.filter((g) => {
    const isDeleted = typeof g["deleted_at"] === "string" && g["deleted_at"];
    if (isDeleted) deletedIds.push(str(g, "id"));
    return !isDeleted;
  });

  const live: CheckInRecord[] = await Promise.all(
    liveRows.map(async (g) => {
      const payment = str(g, "payment_action");
      return {
        id: str(g, "id"),
        roomNumber: await tryDecrypt(dek, str(g, "room_number")),
        clientName: await tryDecrypt(dek, str(g, "client_name")),
        peopleEntered: num(g, "people_entered"),
        timestamp: str(g, "checked_in_at"),
        ...(payment ? { paymentAction: payment } : {}),
      } as CheckInRecord;
    }),
  );

  applyServerCheckins(live, deletedIds);
  return { pulled: live.length };
}

/** Fire-and-forget: push today's check-ins if this device is connected. Never throws. */
export async function autoSyncCheckinsIfConnected(): Promise<void> {
  try {
    const code = storedSyncCode();
    if (!code || !cachedLocation()) return;
    if (!(await ensureSession())) return;
    await syncCheckinsToSupabase(code);
  } catch (e) {
    console.error("autoSyncCheckins failed:", e);
  }
}

/** Fire-and-forget: push a tombstone for an undone check-in if connected. Never throws. */
export async function autoTombstoneIfConnected(id: string): Promise<void> {
  try {
    if (!storedSyncCode() || !cachedLocation()) return;
    if (!(await ensureSession())) return;
    await pushCheckinTombstone(id);
  } catch (e) {
    console.error("autoTombstone failed:", e);
  }
}

/** Fire-and-forget: pull check-ins if connected, reconciling into today's session. */
export async function autoPullCheckinsIfConnected(): Promise<number> {
  try {
    const code = storedSyncCode();
    if (!code || !cachedLocation()) return 0;
    const { pulled } = await pullCheckinsFromSupabase(code);
    return pulled;
  } catch (e) {
    console.error("autoPullCheckins failed:", e);
    return 0;
  }
}
