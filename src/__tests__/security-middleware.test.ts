// @vitest-environment node
/**
 * End-to-end on the middleware: it is what actually enforces the gate.
 *
 * api-access.test.ts covers the same-origin rule by rebuilding the helper from
 * source. This drives the real handler, so it also covers what was added
 * around that rule: the device cookie, per-route method and size gates, and
 * the tiered two-dimension rate limit.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { SESSION_COOKIE, signSession } from "@/lib/security/identity";

const HOST = "check-in-pdj.vercel.app";
const ORIGIN = `https://${HOST}`;

beforeAll(() => {
  process.env.SESSION_SECRET = "middleware-test-secret-value-32ch";
  delete process.env.API_AUTH_TOKEN;
});

let counter = 0;
/** Unique IP per case — the limiter store is module-level and shared. */
function freshIp(): string {
  counter += 1;
  return `10.0.${Math.floor(counter / 250)}.${counter % 250}`;
}

async function cookieFor(propertyCode = "default"): Promise<string> {
  return signSession({
    id: `dev-${counter}-${Math.random()}`,
    propertyCode,
    iat: Date.now(),
  });
}

function apiRequest(opts: {
  path?: string;
  method?: string;
  origin?: string | null;
  cookie?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const headers = new Headers({ host: HOST, ...(opts.headers ?? {}) });
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  if (opts.cookie) headers.set("cookie", `${SESSION_COOKIE}=${opts.cookie}`);
  headers.set("x-forwarded-for", opts.ip ?? freshIp());
  return new NextRequest(`${ORIGIN}${opts.path ?? "/api/ocr-unified"}`, {
    method: opts.method ?? "POST",
    headers,
  });
}

describe("the cookie arrives without anyone being asked for anything", () => {
  it("mints one on a normal page load", async () => {
    const res = await middleware(
      new NextRequest(`${ORIGIN}/upload`, { headers: new Headers({ host: HOST }) })
    );
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  it("still sets the CSP nonce header on that page", async () => {
    // The cookie was added to this path; the policy must survive it.
    const res = await middleware(
      new NextRequest(`${ORIGIN}/search`, { headers: new Headers({ host: HOST }) })
    );
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("nonce-");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("does not re-mint when the browser already has a valid one", async () => {
    const res = await middleware(
      new NextRequest(`${ORIGIN}/search`, {
        headers: new Headers({ host: HOST, cookie: `${SESSION_COOKIE}=${await cookieFor()}` }),
      })
    );
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("never blocks a page load", async () => {
    const res = await middleware(
      new NextRequest(`${ORIGIN}/`, { headers: new Headers({ host: HOST }) })
    );
    expect(res.status).toBe(200);
  });
});

describe("API routes need a recognised caller", () => {
  it("allows a request carrying a valid cookie", async () => {
    expect((await middleware(apiRequest({ cookie: await cookieFor() }))).status).toBe(200);
  });

  it("refuses an anonymous same-origin request", async () => {
    const res = await middleware(apiRequest({ cookie: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthenticated");
  });

  it("refuses a forged cookie", async () => {
    expect((await middleware(apiRequest({ cookie: "forged.deadbeef" }))).status).toBe(401);
  });

  it("refuses curl, which sends no Origin — before it even reaches the cookie check", async () => {
    const res = await middleware(apiRequest({ origin: null, cookie: null }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("cross_origin_denied");
  });

  it("refuses a cross-site POST even with a valid cookie", async () => {
    const res = await middleware(
      apiRequest({ origin: "https://evil.example", cookie: await cookieFor() })
    );
    expect(res.status).toBe(403);
  });

  it("refreshes the cookie on API calls so a shift never lapses mid-service", async () => {
    const res = await middleware(apiRequest({ cookie: await cookieFor() }));
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });
});

describe("method and path gating", () => {
  it("refuses GET on a POST-only route", async () => {
    const res = await middleware(apiRequest({ method: "GET", cookie: await cookieFor() }));
    expect(res.status).toBe(405);
  });

  it("denies an unknown /api path by default", async () => {
    const res = await middleware(
      apiRequest({ path: "/api/not-a-route", cookie: await cookieFor() })
    );
    expect(res.status).toBe(400);
  });

  it("covers the privacy routes too", async () => {
    for (const path of ["/api/privacy/erase", "/api/privacy/export"]) {
      expect((await middleware(apiRequest({ path, cookie: null }))).status).toBe(401);
    }
  });
});

describe("body size is refused before the body is read", () => {
  it("rejects an oversized declared content-length", async () => {
    const res = await middleware(
      apiRequest({
        cookie: await cookieFor(),
        headers: { "content-length": String(500 * 1024 * 1024) },
      })
    );
    expect(res.status).toBe(413);
  });

  it("lets a reasonable content-length through", async () => {
    const res = await middleware(
      apiRequest({ cookie: await cookieFor(), headers: { "content-length": "2048" } })
    );
    expect(res.status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("rejects once one device exceeds the route tier", async () => {
    const cookie = await cookieFor();
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      statuses.push((await middleware(apiRequest({ cookie, ip }))).status);
    }
    expect(statuses).toContain(429);
    // /api/ocr-unified allows 12 per 5 minutes per device.
    expect(statuses.indexOf(429)).toBe(12);
  });

  it("sets Retry-After and a code on a limited response", async () => {
    const cookie = await cookieFor();
    const ip = freshIp();
    let res = await middleware(apiRequest({ cookie, ip }));
    for (let i = 0; i < 20 && res.status !== 429; i++) {
      res = await middleware(apiRequest({ cookie, ip }));
    }
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await res.json()).code).toBe("rate_limited");
  });

  it("exposes remaining budget on allowed responses", async () => {
    const res = await middleware(apiRequest({ cookie: await cookieFor() }));
    expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBeGreaterThanOrEqual(0);
    expect(Number(res.headers.get("X-RateLimit-Limit"))).toBeGreaterThan(0);
  });

  it("does not let one exhausted device block another", async () => {
    const ip = freshIp();
    const exhausted = await cookieFor();
    let res = await middleware(apiRequest({ cookie: exhausted, ip }));
    for (let i = 0; i < 20 && res.status !== 429; i++) {
      res = await middleware(apiRequest({ cookie: exhausted, ip }));
    }
    expect(res.status).toBe(429);
    expect(
      (await middleware(apiRequest({ cookie: await cookieFor(), ip: freshIp() }))).status
    ).toBe(200);
  });

  it("applies a much tighter tier to the privacy routes", async () => {
    const cookie = await cookieFor();
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push(
        (await middleware(apiRequest({ path: "/api/privacy/export", cookie, ip }))).status
      );
    }
    // 5 per hour, well below the OCR routes.
    expect(statuses.indexOf(429)).toBe(5);
  });
});

describe("the optional service token is additive", () => {
  it("rejects a wrong token instead of falling back to same-origin", async () => {
    process.env.API_AUTH_TOKEN = "a-service-token-of-good-length";
    try {
      const res = await middleware(
        apiRequest({
          cookie: await cookieFor(),
          headers: { authorization: "Bearer wrong-token-entirely-here" },
        })
      );
      expect(res.status).toBe(401);
    } finally {
      delete process.env.API_AUTH_TOKEN;
    }
  });

  it("does NOT 401 the tablet just because a token is configured", async () => {
    // .env.sample called this "required in production". Setting it used to
    // reject every upload, because the browser sends no Authorization header.
    process.env.API_AUTH_TOKEN = "a-service-token-of-good-length";
    try {
      const res = await middleware(apiRequest({ cookie: await cookieFor() }));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.API_AUTH_TOKEN;
    }
  });

  it("accepts a correct token from a caller with no cookie and no Origin", async () => {
    process.env.API_AUTH_TOKEN = "a-service-token-of-good-length";
    try {
      const res = await middleware(
        apiRequest({
          origin: null,
          cookie: null,
          headers: { authorization: "Bearer a-service-token-of-good-length" },
        })
      );
      expect(res.status).toBe(200);
    } finally {
      delete process.env.API_AUTH_TOKEN;
    }
  });
});

describe("rejections carry no infrastructure detail", () => {
  it("returns only a message and a code", async () => {
    const body = await (await middleware(apiRequest({ cookie: null }))).json();
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    expect(JSON.stringify(body).toLowerCase()).not.toContain("mistral");
  });
});
