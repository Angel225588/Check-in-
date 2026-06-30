// Push the current day's clients to Supabase with zero-knowledge encryption.
// Name / room / VIP notes are encrypted on-device with a key derived from the
// access code (never sent to the server); the rest are non-PII operational fields.
import { getSupabase } from "../supabase";
import { cachedLocation } from "./session";
import { getTodayData } from "../storage";
import { deriveLocationKeys, encryptField } from "../crypto/field-crypto";

export interface PushResult {
  pushed: number;
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
  const { dek } = await deriveLocationKeys(code, btoa(loc.locationId));

  const rows = await Promise.all(
    clients.map(async (c) => ({
      location_id: loc.locationId,
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

  const { error } = await getSupabase().from("clients").insert(rows);
  if (error) throw new Error(error.message);
  return { pushed: rows.length };
}
