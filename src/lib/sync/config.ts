// Sync engine configuration + device identity.
// The feature flag keeps localStorage authoritative until sync is proven.

export const SYNC_ENABLED =
  (process.env.NEXT_PUBLIC_SYNC_ENABLED ?? "false").toLowerCase() === "true";

// Public, fixed project values (single imarketin project, multi-tenant via RLS).
// The anon key is public by design — exposed to every browser; RLS protects the data.
// Baked as defaults so the app connects without per-deploy env setup; env overrides win.
const DEFAULT_SUPABASE_URL = "https://qimhmwkmkbqxsvtayldn.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpbWhtd2tta2JxeHN2dGF5bGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTkzNDUsImV4cCI6MjA5NzM3NTM0NX0.I56UA2pAERLaoflWK5Qf-LUkd-ONY8-t_TQzdeL-rFQ";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

/** Optional default location code (pilot convenience) — pre-fills the sync drawer. */
export const DEFAULT_SYNC_CODE = process.env.NEXT_PUBLIC_DEFAULT_SYNC_CODE || "";

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
