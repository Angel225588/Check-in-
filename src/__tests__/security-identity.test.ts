// @vitest-environment node
/**
 * Fix: a stable per-device identity for metering — explicitly NOT auth.
 *
 * docs/GDPR-AUDIT.md §2 C3 records that no authentication exists, and
 * middleware.ts explains why a shared bearer token cannot provide it for a
 * browser-called PWA. Nothing here changes that. What it adds is a signed
 * cookie the browser obtains without anyone typing anything, so rate limits
 * and spend are keyed on something better than an IP address.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  signSession,
  verifySession,
  createSession,
  resolveTokenIdentity,
  timingSafeEqual,
  sessionCookieOptions,
  newDeviceId,
  SESSION_TTL_MS,
} from "@/lib/security/identity";

const SECRET = "test-secret-value-at-least-16-chars";
const OTHER = "a-completely-different-secret-key!!";
const NOW = 1_800_000_000_000;

describe("signed device cookie", () => {
  it("round-trips a valid session", async () => {
    const v = await signSession({ id: "abc", propertyCode: "p1", iat: NOW }, SECRET);
    expect(await verifySession(v, SECRET, NOW)).toMatchObject({
      id: "abc",
      propertyCode: "p1",
    });
  });

  it("rejects a cookie signed with another secret", async () => {
    const v = await signSession({ id: "abc", propertyCode: "p1", iat: NOW }, OTHER);
    expect(await verifySession(v, SECRET, NOW)).toBeNull();
  });

  it("rejects a tampered property claim", async () => {
    // Forging this would bill another property's budget and, once the privacy
    // routes go live, name someone else's tenant.
    const v = await signSession({ id: "abc", propertyCode: "p1", iat: NOW }, SECRET);
    const sig = v.split(".")[1];
    const forged = Buffer.from(
      JSON.stringify({ id: "abc", propertyCode: "victim", iat: NOW })
    ).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rejects malformed, empty and unsigned values", async () => {
    for (const bad of [undefined, "", "no-dot", ".sig", "garbage.garbage"]) {
      expect(await verifySession(bad, SECRET, NOW)).toBeNull();
    }
  });

  it("rejects an expired session but accepts one at the boundary", async () => {
    const v = await signSession({ id: "abc", propertyCode: "p", iat: NOW }, SECRET);
    expect(await verifySession(v, SECRET, NOW + SESSION_TTL_MS - 1)).not.toBeNull();
    expect(await verifySession(v, SECRET, NOW + SESSION_TTL_MS + 1)).toBeNull();
  });

  it("rejects a cookie issued in the future", async () => {
    const v = await signSession({ id: "a", propertyCode: "p", iat: NOW + 600_000 }, SECRET);
    expect(await verifySession(v, SECRET, NOW)).toBeNull();
  });

  it("rejects a correctly-signed but incomplete payload", async () => {
    const body = Buffer.from(JSON.stringify({ id: "abc" })).toString("base64url");
    expect(await verifySession(`${body}.deadbeef`, SECRET, NOW)).toBeNull();
  });

  it("mints unique device ids", () => {
    expect(new Set(Array.from({ length: 200 }, newDeviceId)).size).toBe(200);
  });

  it("creates a session with no password anywhere in the flow", async () => {
    const { value, identity } = await createSession("p9", NOW);
    expect(identity.kind).toBe("device");
    expect(identity.propertyCode).toBe("p9");
    expect(await verifySession(value, undefined, NOW)).not.toBeNull();
  });
});

describe("cookie hardening", () => {
  it("is HttpOnly and SameSite=Lax, so a cross-site POST never carries it", () => {
    const o = sessionCookieOptions(true);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.secure).toBe(true);
  });

  it("drops Secure outside production so local http still works", () => {
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});

describe("optional service token", () => {
  const saved = process.env.API_AUTH_TOKEN;
  beforeEach(() => {
    process.env.API_AUTH_TOKEN = "a-service-token-of-good-length";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.API_AUTH_TOKEN;
    else process.env.API_AUTH_TOKEN = saved;
  });

  it("accepts the configured token", () => {
    expect(resolveTokenIdentity("Bearer a-service-token-of-good-length", "p")?.kind).toBe(
      "token"
    );
  });

  it("rejects a wrong, missing or unprefixed token", () => {
    expect(resolveTokenIdentity("Bearer nope", "p")).toBeNull();
    expect(resolveTokenIdentity(null, "p")).toBeNull();
    expect(resolveTokenIdentity("a-service-token-of-good-length", "p")).toBeNull();
  });

  it("ignores an unset or too-short token rather than accepting anything", () => {
    delete process.env.API_AUTH_TOKEN;
    expect(resolveTokenIdentity("Bearer anything", "p")).toBeNull();
    process.env.API_AUTH_TOKEN = "short";
    expect(resolveTokenIdentity("Bearer short", "p")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("compares without leaking length-independent early exits", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("the module says what it is", () => {
  it("states plainly that this is not authentication", () => {
    // Load-bearing, exactly as api-access.test.ts asserts for the middleware.
    // Someone will read "identity" and assume the routes are authenticated.
    const src = readFileSync(
      path.resolve(__dirname, "../lib/security/identity.ts"),
      "utf8"
    );
    expect(src).toMatch(/NOT authentication/i);
    expect(src).toMatch(/GDPR-AUDIT/);
  });
});
