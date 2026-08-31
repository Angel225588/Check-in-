/**
 * Fix: rate limiting per caller AND per IP, with a tier per route.
 *
 * Before, one 30/min-per-IP bucket covered all seven routes. A hotel behind a
 * single NAT shared that bucket while an attacker got a fresh one per address,
 * and a cheap image OCR counted the same as a PDF that bills per page.
 */
import { describe, it, expect } from "vitest";
import {
  MemoryRateLimitStore,
  consume,
  checkDual,
  pruneExpired,
  clientIpFrom,
} from "@/lib/security/rate-limit";
import { ROUTE_POLICIES, getRoutePolicy } from "@/lib/security/config";

const TIER = { limit: 3, windowMs: 60_000 };
const T = 1_000_000;

describe("fixed window", () => {
  it("allows up to the limit, then rejects", () => {
    const s = new MemoryRateLimitStore();
    expect(consume(s, "k", TIER, T).allowed).toBe(true);
    expect(consume(s, "k", TIER, T).allowed).toBe(true);
    expect(consume(s, "k", TIER, T).allowed).toBe(true);
    expect(consume(s, "k", TIER, T).allowed).toBe(false);
  });

  it("reports remaining and retry-after inside the window", () => {
    const s = new MemoryRateLimitStore();
    expect(consume(s, "k", TIER, T).remaining).toBe(2);
    const third = consume(s, "k", TIER, T + 30_000);
    expect(third.remaining).toBe(1);
    expect(third.retryAfter).toBe(30);
  });

  it("resets after the window elapses", () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 4; i++) consume(s, "k", TIER, T);
    expect(consume(s, "k", TIER, T).allowed).toBe(false);
    expect(consume(s, "k", TIER, T + 60_001).allowed).toBe(true);
  });

  it("stays pinned while a caller keeps hammering", () => {
    // Counting continues past the limit, so racing the boundary does not work.
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 50; i++) consume(s, "k", TIER, T);
    expect(consume(s, "k", TIER, T + 59_000).allowed).toBe(false);
  });

  it("keeps distinct keys independent", () => {
    const s = new MemoryRateLimitStore();
    for (let i = 0; i < 4; i++) consume(s, "a", TIER, T);
    expect(consume(s, "a", TIER, T).allowed).toBe(false);
    expect(consume(s, "b", TIER, T).allowed).toBe(true);
  });
});

describe("two dimensions", () => {
  const perIdentity = { limit: 2, windowMs: 60_000 };
  const perIp = { limit: 5, windowMs: 60_000 };
  const base = { path: "/api/ocr-pdf", perIdentity, perIp };

  it("rejects on the identity dimension first", () => {
    const s = new MemoryRateLimitStore();
    const input = { ...base, identityId: "device-1", ip: "1.1.1.1" };
    expect(checkDual(s, input, T).allowed).toBe(true);
    expect(checkDual(s, input, T).allowed).toBe(true);
    const denied = checkDual(s, input, T);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe("identity");
  });

  it("catches one host cycling fresh cookies to reset its identity bucket", () => {
    const s = new MemoryRateLimitStore();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(checkDual(s, { ...base, identityId: `fresh-${i}`, ip: "9.9.9.9" }, T));
    }
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
    expect(results[5].allowed).toBe(false);
    expect(results[5].scope).toBe("ip");
  });

  it("does not let one hotel's own device starve another route", () => {
    const s = new MemoryRateLimitStore();
    const who = { identityId: "d", ip: "2.2.2.2" };
    checkDual(s, { ...base, ...who }, T);
    checkDual(s, { ...base, ...who }, T);
    expect(checkDual(s, { ...base, ...who }, T).allowed).toBe(false);
    expect(
      checkDual(s, { ...base, ...who, path: "/api/ocr-unified" }, T).allowed
    ).toBe(true);
  });
});

describe("per-route tiers replace the blanket bucket", () => {
  it("gives every route its own two tiers", () => {
    for (const p of ROUTE_POLICIES) {
      expect(p.perIdentity.limit).toBeGreaterThan(0);
      expect(p.perIp.limit).toBeGreaterThan(0);
    }
  });

  it("is stricter everywhere than the old 30/min", () => {
    for (const p of ROUTE_POLICIES) {
      const perMinute = p.perIdentity.limit / (p.perIdentity.windowMs / 60_000);
      expect(perMinute).toBeLessThan(30);
    }
  });

  it("limits the morning brief hardest — it runs OCR and a chat call", () => {
    const brief = getRoutePolicy("/api/ocr-morning-brief")!;
    const image = getRoutePolicy("/api/ocr-unified")!;
    const perHour = (t: { limit: number; windowMs: number }) =>
      t.limit / (t.windowMs / 3_600_000);
    expect(perHour(brief.perIdentity)).toBeLessThan(perHour(image.perIdentity));
  });

  it("limits per-page PDF routes below single-image routes", () => {
    expect(getRoutePolicy("/api/ocr-pdf")!.perIdentity.limit).toBeLessThan(
      getRoutePolicy("/api/ocr-unified")!.perIdentity.limit
    );
  });

  it("limits the privacy routes tightly — erasure is rare and deliberate", () => {
    for (const path of ["/api/privacy/erase", "/api/privacy/export"]) {
      const p = getRoutePolicy(path)!;
      expect(p.perIdentity.limit).toBeLessThanOrEqual(5);
      expect(p.perIdentity.windowMs).toBeGreaterThanOrEqual(3_600_000);
    }
  });
});

describe("housekeeping", () => {
  it("prunes only windows that already reset", () => {
    const s = new MemoryRateLimitStore();
    consume(s, "old", { limit: 1, windowMs: 1_000 }, 1_000);
    consume(s, "new", { limit: 1, windowMs: 600_000 }, 1_000);
    expect(pruneExpired(s, 5_000)).toBe(1);
    expect(s.get("new")).toBeDefined();
    expect(s.get("old")).toBeUndefined();
  });

  it("takes the left-most x-forwarded-for entry", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" }))).toBe(
      "3.3.3.3"
    );
  });

  it("collapses a missing IP into one bucket, not unlimited fresh keys", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
