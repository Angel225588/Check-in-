// Push the current day's clients to Supabase with zero-knowledge encryption.
// Name / room / VIP notes are encrypted on-device with a key derived from the
// access code (never sent to the server); the rest are non-PII operational fields.
import type { Client } from "../types";
import { getSupabase } from "../supabase";
import { cachedLocation } from "./session";
import { getTodayData, saveClientsMerged } from "../storage";
import { deriveLocationKeys, encryptField, decryptField, blindIndex } from "../crypto/field-crypto";

const SYNC_CODE_KEY = "imk_sync_code";

/** Keep the access code on-device so sync can encrypt without re-asking. The device
 *  is the authorized decryptor; the server still can never read the data. */
export function storeSyncCode(code: string): void {
  if (typeof window !== "undefined") localStorage.setItem(SYNC_CODE_KEY, code.trim());
}
export function storedSyncCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SYNC_CODE_KEY) || "";
}

export interface PushResult {
  pushed: number;
}

export interface PullResult {
  pulled: number;
}

async function tryDecrypt(dek: CryptoKey, v: string): Promise<string> {
  if (!v) return "";
  try {
    return await decryptField(dek, v);
  } catch {
    return v; // legacy plaintext or wrong key — show as-is
  }
}

/**
 * Encrypt + insert today's clients for the connected location.
 * `code` is the access code (used to derive the encryption key) — held in memory only.
 */
export async function syncDayToSupabase(code: string): Promise<PushResult> {
  const loc = cachedLocation();
  if (!loc) throw new Error("not_connected");

  const clients = getTodayData()?.clients ?? [];
  if (clients.length === 0) return { pushed: 0 };

  // Salt = base64(location_id): non-secret, stable, shared by every device with the code.
  const { dek, indexKey } = await deriveLocationKeys(code, btoa(loc.locationId));

  const rows = await Promise.all(
    clients.map(async (c) => ({
      location_id: loc.locationId,
      // deterministic, non-PII dedup key (blind index of room|name) — drives idempotent upsert
      client_local_key: await blindIndex(indexKey, `${(c.roomNumber || "").trim()}|${(c.name || "").trim()}`),
      room_number: await encryptField(dek, c.roomNumber || "—"), // PII → ciphertext
      name: await encryptField(dek, c.name || ""), // PII → ciphertext
      vip_notes: c.vipNotes ? await encryptField(dek, c.vipNotes) : "", // PII → ciphertext
      // non-PII operational fields (clear — power counts/dashboard, no identity)
      room_type: c.roomType || "",
      rtc: c.rtc || "",
      confirmation_number: c.confirmationNumber || "",
      arrival_date: c.arrivalDate || "",
      departure_date: c.departureDate || "",
      reservation_status: c.reservationStatus || "",
      rate_code: c.rateCode || "",
      package_code: c.packageCode || null,
      is_vip: !!c.isVip,
      vip_level: c.vipLevel || null,
      adults: c.adults || 0,
      children: c.children || 0,
    }))
  );

  // Upsert on (location_id, client_local_key) → re-uploads/auto-sync never duplicate.
  const { error } = await getSupabase()
    .from("clients")
    .upsert(rows, { onConflict: "location_id,client_local_key" });
  if (error) throw new Error(error.message);
  return { pushed: rows.length };
}

/** Fire-and-forget: push today's clients if this device is connected. Never throws. */
export async function autoSyncIfConnected(): Promise<void> {
  try {
    const code = storedSyncCode();
    if (!code || !cachedLocation()) return;
    await syncDayToSupabase(code);
  } catch (e) {
    console.error("autoSync failed:", e);
  }
}

/**
 * Pull the location's clients from Supabase, decrypt PII on-device with the
 * code-derived key, and merge them into today's local session — so a second
 * device "sees the session" that another already started.
 */
export async function pullDayFromSupabase(code: string): Promise<PullResult> {
  const loc = cachedLocation();
  if (!loc) throw new Error("not_connected");
  const { dek } = await deriveLocationKeys(code, btoa(loc.locationId));

  const { data, error } = await getSupabase().from("clients").select("*").is("deleted_at", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { pulled: 0 };

  const clients: Client[] = await Promise.all(
    rows.map(async (g) => {
      const str = (k: string) => (typeof g[k] === "string" ? (g[k] as string) : "");
      const num = (k: string) => (typeof g[k] === "number" ? (g[k] as number) : 0);
      return {
        roomNumber: await tryDecrypt(dek, str("room_number")),
        name: await tryDecrypt(dek, str("name")),
        roomType: str("room_type"),
        rtc: str("rtc"),
        confirmationNumber: str("confirmation_number"),
        arrivalDate: str("arrival_date"),
        departureDate: str("departure_date"),
        reservationStatus: str("reservation_status"),
        adults: num("adults"),
        children: num("children"),
        rateCode: str("rate_code"),
        packageCode: str("package_code"),
        isVip: g["is_vip"] === true,
        vipLevel: str("vip_level") || undefined,
        vipNotes: await tryDecrypt(dek, str("vip_notes")),
      } as Client;
    })
  );

  saveClientsMerged(clients);
  return { pulled: clients.length };
}
