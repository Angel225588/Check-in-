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

// Honor an env override ONLY if it's actually valid — otherwise use the fixed project
// value. This survives a stale / blank / trailing-slash NEXT_PUBLIC_SUPABASE_URL on
// Vercel (the cause of the auth-location HTTP 404).
function resolveSupabaseUrl(): string {
  const env = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env) ? env : DEFAULT_SUPABASE_URL;
}
function resolveAnonKey(): string {
  const env = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return env.startsWith("eyJ") ? env : DEFAULT_SUPABASE_ANON_KEY;
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_ANON_KEY = resolveAnonKey();

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
