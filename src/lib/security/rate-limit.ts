/**
 * Fixed-window rate limiter, keyed on two dimensions.
 *
 * Replaces the single 30/min-per-IP bucket that every /api route shared. Two
 * problems with that: a whole hotel behind one NAT contended for one bucket
 * while an attacker got a fresh one per IP, and a cheap image OCR counted the
 * same as a multi-page PDF that bills per page.
 *
 * Now each request is counted against the caller's device identity AND its
 * IP, with a tier per route. The IP dimension is what catches a client
 * discarding its cookie to reset the identity bucket.
 *
 * The store is injectable so tests can drive a fake clock, and so a shared
 * store can replace it later. The default is per-instance memory: on
 * serverless the effective ceiling is (limit x instances). That is a real
 * weakness of in-memory limiting, and it is why the spend cap exists as the
 * hard backstop rather than the rate limit alone.
 */

import type { RateLimitTier } from "./config";

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, RateLimitEntry]>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, RateLimitEntry>();
  get(key: string) {
    return this.map.get(key);
  }
  set(key: string, entry: RateLimitEntry) {
    this.map.set(key, entry);
  }
  delete(key: string) {
    this.map.delete(key);
  }
  entries() {
    return this.map.entries();
  }
  get size() {
    return this.map.size;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
  limit: number;
}

/**
 * Count one request against `key`. Counting continues past the limit, so a
 * caller who keeps hammering keeps the window pinned instead of slipping
 * through as the count decays.
 */
export function consume(
  store: RateLimitStore,
  key: string,
  tier: RateLimitTier,
  now: number = Date.now()
): RateLimitResult {
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + tier.windowMs });
    return {
      allowed: true,
      remaining: tier.limit - 1,
      retryAfter: Math.ceil(tier.windowMs / 1000),
      limit: tier.limit,
    };
  }

  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: entry.count <= tier.limit,
    remaining: Math.max(0, tier.limit - entry.count),
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    limit: tier.limit,
  };
}

/** Drop windows that have already reset. Called opportunistically. */
export function pruneExpired(store: RateLimitStore, now: number = Date.now()): number {
  const stale: string[] = [];
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) stale.push(key);
  }
  for (const key of stale) store.delete(key);
  return stale.length;
}

export interface DualCheckInput {
  identityId: string;
  ip: string;
  path: string;
  perIdentity: RateLimitTier;
  perIp: RateLimitTier;
}

export interface DualCheckResult extends RateLimitResult {
  /** Which dimension rejected, when allowed is false. */
  scope: "identity" | "ip" | null;
}

export function checkDual(
  store: RateLimitStore,
  input: DualCheckInput,
  now: number = Date.now()
): DualCheckResult {
  const identity = consume(
    store,
    `id:${input.identityId}:${input.path}`,
    input.perIdentity,
    now
  );
  const ip = consume(store, `ip:${input.ip}:${input.path}`, input.perIp, now);

  if (!identity.allowed) return { ...identity, scope: "identity" };
  if (!ip.allowed) return { ...ip, scope: "ip" };

  // Report whichever dimension is nearest its ceiling.
  const tighter = identity.remaining <= ip.remaining ? identity : ip;
  return { ...tighter, scope: null };
}

/**
 * Best-effort client IP. `x-forwarded-for` is attacker-controlled in general,
 * but Vercel overwrites it, so the left-most entry is the real client. A
 * missing header collapses into one shared bucket rather than handing out
 * unlimited fresh keys.
 */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
