// Restaurant → Réception nudge. If the restaurant opens before the report is uploaded,
// it can either upload itself or "Prévenir la réception" — which stamps a timestamp the
// reception device polls and surfaces as a banner. Cleared once the roster is uploaded.
import { getSupabase } from "../supabase";
import { cachedLocation } from "./session";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Restaurant asks reception to upload today's report. */
export async function requestReport(): Promise<void> {
  const loc = cachedLocation();
  if (!loc) throw new Error("not_connected");
  const { error } = await getSupabase().from("sessions").upsert(
    { location_id: loc.locationId, service_date: today(), report_requested_at: new Date().toISOString() },
    { onConflict: "location_id,service_date" },
  );
  if (error) throw new Error(error.message);
}

/** Reception: is the restaurant waiting for the report right now? (recent request). */
export async function reportRequestedRecently(maxAgeMin = 120): Promise<boolean> {
  const loc = cachedLocation();
  if (!loc) return false;
  const { data, error } = await getSupabase()
    .from("sessions")
    .select("report_requested_at")
    .eq("location_id", loc.locationId)
    .eq("service_date", today())
    .maybeSingle();
  const ts = data?.report_requested_at;
  if (error || typeof ts !== "string") return false;
  return Date.now() - new Date(ts).getTime() < maxAgeMin * 60_000;
}

/** Clear the request once reception has uploaded. Best-effort. */
export async function clearReportRequest(): Promise<void> {
  const loc = cachedLocation();
  if (!loc) return;
  try {
    await getSupabase()
      .from("sessions")
      .update({ report_requested_at: null })
      .eq("location_id", loc.locationId)
      .eq("service_date", today());
  } catch (e) {
    console.error("clearReportRequest failed:", e);
  }
}
