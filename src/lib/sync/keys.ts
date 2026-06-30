// In-memory cache for the per-location derived keys.
// deriveLocationKeys runs PBKDF2 (210k iterations) — fine once at login, but the
// live-sync poll calls the pull path every few seconds. Caching the CryptoKeys
// (which are non-extractable and live only in this session) keeps the poll cheap
// without ever persisting key material.
import { deriveLocationKeys, type LocationKeys } from "../crypto/field-crypto";
import { cachedLocation } from "./session";

let cache: { code: string; loc: string; keys: LocationKeys } | null = null;

/** Derive (or reuse) the encryption + blind-index keys for the connected location. */
export async function locationKeys(code: string): Promise<LocationKeys> {
  const locId = cachedLocation()?.locationId ?? "";
  if (cache && cache.code === code && cache.loc === locId) return cache.keys;
  const keys = await deriveLocationKeys(code, btoa(locId));
  cache = { code, loc: locId, keys };
  return keys;
}

/** Drop cached keys (call on sign-out / code change). */
export function clearLocationKeys(): void {
  cache = null;
}
