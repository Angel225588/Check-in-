// Sync engine configuration + device identity.
// The feature flag keeps localStorage authoritative until sync is proven.

export const SYNC_ENABLED =
  (process.env.NEXT_PUBLIC_SYNC_ENABLED ?? "false").toLowerCase() === "true";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const DEVICE_ID_KEY = "imarketin_device_id";

/** Stable per-device id (random, persisted). Used to attribute mutations + reconcile. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
