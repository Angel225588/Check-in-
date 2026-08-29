/**
 * A stable per-device identity for metering — NOT authentication.
 *
 * READ THIS BEFORE CHANGING IT. `docs/GDPR-AUDIT.md` §2 C3 records that this
 * app has no authentication, and `middleware.ts` explains at length why a
 * shared bearer token cannot provide it for a PWA the browser calls directly:
 * the secret would have to ship inside the bundle. None of that changed here,
 * and this module does not claim otherwise.
 *
 * What it adds is narrower and still worth having. Rate limiting was keyed on
 * IP alone, so a whole hotel behind one NAT shared a single bucket while an
 * attacker on a residential connection got a fresh one per address. This
 * issues an HMAC-signed, HttpOnly, SameSite=Lax cookie on page load — no
 * prompt, nobody typing anything — giving every caller a stable key to meter
 * and bill against.
 *
 * What it does NOT do: prove who the person is. Anyone who can load the page
 * gets a cookie, and a script that forges `Origin` can fetch one. It raises
 * the cost of drive-by abuse and makes spend attributable. Real authentication
 * remains the Supabase Auth work in the audit.
 *
 * Runs in the Edge runtime: Web Crypto only, no Node Buffer.
 */

export const SESSION_COOKIE = "cin_did";

/** 30 days. Expiry is a UX papercut here, not a security control. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface DeviceIdentity {
  kind: "device" | "token";
  /** Rate-limit and budget key. */
  id: string;
  /** Billing / tenancy scope. */
  propertyCode: string;
}

interface SessionPayload {
  id: string;
  propertyCode: string;
  /** Issued-at, epoch ms. */
  iat: number;
}

/**
 * Fallback signing key when SESSION_SECRET is unset.
 *
 * Random, per-instance, and it dies with the instance — cookies then stop
 * verifying across restarts and the middleware silently issues a fresh one.
 * Users are never blocked by this; the cost is that metering keys churn, so
 * set SESSION_SECRET in production.
 */
let ephemeralSecret: string | null = null;

export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (!ephemeralSecret) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    ephemeralSecret = bytesToHex(buf);
  }
  return ephemeralSecret;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(input: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string | null {
  try {
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Constant-time compare, so signature checks cannot be timed. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newDeviceId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export async function signSession(
  payload: SessionPayload,
  secret: string = getSessionSecret()
): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await hmac(secret, body)}`;
}

/** Returns null for malformed, badly-signed, expired or future-dated cookies. */
export async function verifySession(
  value: string | undefined,
  secret: string = getSessionSecret(),
  now: number = Date.now()
): Promise<SessionPayload | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!timingSafeEqual(sig, await hmac(secret, body))) return null;

  const json = base64UrlDecode(body);
  if (!json) return null;

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }

  if (
    typeof parsed.id !== "string" ||
    parsed.id.length === 0 ||
    typeof parsed.propertyCode !== "string" ||
    typeof parsed.iat !== "number"
  ) {
    return null;
  }

  if (now - parsed.iat > SESSION_TTL_MS) return null;
  // Issued in the future: a tampered clock or a replay.
  if (parsed.iat - now > 60_000) return null;

  return parsed;
}

export async function createSession(
  propertyCode: string,
  now: number = Date.now()
): Promise<{ value: string; identity: DeviceIdentity }> {
  const id = newDeviceId();
  return {
    value: await signSession({ id, propertyCode, iat: now }),
    identity: { kind: "device", id, propertyCode },
  };
}

export function sessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/**
 * Server-to-server callers holding API_AUTH_TOKEN. Kept exactly as main
 * intends it: optional, and additive rather than a replacement — the browser
 * app never sends one.
 */
export function resolveTokenIdentity(
  authorizationHeader: string | null,
  propertyCode: string
): DeviceIdentity | null {
  const expected = process.env.API_AUTH_TOKEN;
  if (!expected || expected.length < 16) return null;
  if (!authorizationHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  if (!timingSafeEqual(match[1].trim(), expected)) return null;

  return { kind: "token", id: "service-token", propertyCode };
}
