// Auth bridge: exchange a location code for a real Supabase session, and read
// location/role from the LIVE JWT (never a cached copy) at call time. The cache
// is for offline display only.
import { getSupabase } from "../supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export interface LocationSession {
  locationId: string;
  role: string;
  locationName?: string;
}

const CACHE_KEY = "imarketin_location_cache";

export function cachedLocation(): LocationSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocationSession;
  } catch {
    return null;
  }
}

function setCachedLocation(s: LocationSession): void {
  if (typeof window !== "undefined") localStorage.setItem(CACHE_KEY, JSON.stringify(s));
}

/** Exchange an access code for a scoped Supabase session via the auth-location Edge Function. */
export async function exchangeCode(code: string): Promise<LocationSession> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("invalid_code");
    if (res.status === 429) throw new Error("rate_limited");
    throw new Error(`auth_failed_${res.status}`);
  }
  const j = await res.json();
  await getSupabase().auth.setSession({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
  });
  const s: LocationSession = { locationId: j.location_id, role: j.role, locationName: j.location_name };
  setCachedLocation(s);
  return s;
}

/** Tenant id from the LIVE JWT app_metadata (authoritative for every write). */
export async function currentLocationId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  const am = data.session?.user?.app_metadata as { location_id?: string } | undefined;
  return am?.location_id ?? null;
}

export async function currentRole(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  const am = data.session?.user?.app_metadata as { user_role?: string } | undefined;
  return am?.user_role ?? null;
}

export async function hasSession(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession();
  return !!data.session;
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
  if (typeof window !== "undefined") localStorage.removeItem(CACHE_KEY);
}
