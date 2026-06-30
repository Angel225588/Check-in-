// Close-session-everywhere. When one device closes the day, every connected device
// for the location closes too. We flush local data first (so nothing is lost), mark
// the day closed on the server, and other devices detect it on their next pull.
import { getSupabase } from "../supabase";
import { cachedLocation } from "./session";
import { storedSyncCode, syncDayToSupabase } from "./push-day";
import { syncCheckinsToSupabase } from "./push-checkins";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

const ACK_KEY = "imk_closed_ack";

/** The service_date this device has already acted on (so it won't re-close in a loop). */
export function closedAck(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACK_KEY) || "";
}
export function setClosedAck(date: string): void {
  if (typeof window !== "undefined") localStorage.setItem(ACK_KEY, date);
}

/**
 * Mark today's session closed for the whole location. Flushes the roster + check-ins
 * first so no device loses unsynced work when everyone closes. Best-effort: never throws
 * into the close UX (the local close already happened).
 */
export async function pushDayClosed(): Promise<void> {
  const loc = cachedLocation();
  const code = storedSyncCode();
  if (!loc || !code) return;
  try { await syncDayToSupabase(code); } catch { /* offline — local history still saved */ }
  try { await syncCheckinsToSupabase(code); } catch { /* offline */ }
  const date = today();
  try {
    const { error } = await getSupabase().from("sessions").upsert(
      { location_id: loc.locationId, service_date: date, status: "closed", closed_at: new Date().toISOString() },
      { onConflict: "location_id,service_date" },
    );
    if (error) throw new Error(error.message);
    setClosedAck(date); // the closing device must not re-close itself
  } catch (e) {
    console.error("pushDayClosed failed:", e);
  }
}

/** True if today's session is marked closed on the server (for this location). */
export async function isDayClosedRemote(): Promise<boolean> {
  const loc = cachedLocation();
  if (!loc) return false;
  const { data, error } = await getSupabase()
    .from("sessions")
    .select("status")
    .eq("location_id", loc.locationId)
    .eq("service_date", today())
    .maybeSingle();
  if (error) return false;
  return data?.status === "closed";
}

/** Re-open today (a new upload after a close): clears the closed flag + the local ack. */
export async function reopenDayIfClosed(): Promise<void> {
  const loc = cachedLocation();
  if (!loc) return;
  try {
    await getSupabase()
      .from("sessions")
      .update({ status: "open", closed_at: null })
      .eq("location_id", loc.locationId)
      .eq("service_date", today());
    if (typeof window !== "undefined") localStorage.removeItem(ACK_KEY);
  } catch (e) {
    console.error("reopenDay failed:", e);
  }
}
