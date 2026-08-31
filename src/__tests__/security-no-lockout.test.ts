// @vitest-environment node
/**
 * Reception must not be locked out mid-service.
 *
 * The app is used standing, one-handed, with a queue, between 06:30 and 10:30.
 * A security check that refuses a real upload in that window is worse than the
 * abuse it prevents, so these are the cases that must never 4xx.
 *
 * The first version of this middleware answered 401 when a request carried no
 * valid cookie. SESSION_SECRET is optional, so with it unset every serverless
 * instance signs with its own random key — a cookie minted by one instance
 * fails on the next, and the tablet would have seen 401s at random.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { SESSION_COOKIE, signSession } from "@/lib/security/identity";
import { readValidatedFile } from "@/lib/security/guard";
import { getRoutePolicy } from "@/lib/security/config";

const HOST = "check-in-pdj.vercel.app";
const ORIGIN = `https://${HOST}`;

beforeAll(() => {
  delete process.env.API_AUTH_TOKEN;
});
afterEach(() => {
  delete process.env.SECURITY_MODE;
});

let n = 0;
const freshIp = () => `172.16.${Math.floor(++n / 250)}.${n % 250}`;

function upload(opts: { cookie?: string | null; ip?: string } = {}): NextRequest {
  const headers = new Headers({ host: HOST, origin: ORIGIN });
  if (opts.cookie) headers.set("cookie", `${SESSION_COOKIE}=${opts.cookie}`);
  headers.set("x-forwarded-for", opts.ip ?? freshIp());
  return new NextRequest(`${ORIGIN}/api/ocr-unified`, { method: "POST", headers });
}

describe("a same-origin upload is never refused for lacking a cookie", () => {
  it("passes with no cookie at all", async () => {
    const res = await middleware(upload({ cookie: null }));
    expect(res.status).toBe(200);
  });

  it("passes with a cookie this instance cannot verify", async () => {
    // Exactly the cross-instance case: signed with another key entirely.
    const foreign = await signSession(
      { id: "abc", propertyCode: "default", iat: Date.now() },
      "a-totally-different-instance-key!!"
    );
    const res = await middleware(upload({ cookie: foreign }));
    expect(res.status).toBe(200);
  });

  it("passes with an expired cookie", async () => {
    const stale = await signSession({
      id: "abc",
      propertyCode: "default",
      iat: Date.now() - 400 * 24 * 60 * 60 * 1000,
    });
    expect((await middleware(upload({ cookie: stale }))).status).toBe(200);
  });

  it("passes with outright garbage in the cookie", async () => {
    expect((await middleware(upload({ cookie: "not-a-real-cookie" }))).status).toBe(200);
  });

  it("hands the tablet a fresh cookie whenever it could not use the old one", async () => {
    const res = await middleware(upload({ cookie: null }));
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("still refuses a cross-origin POST — the control that actually matters", async () => {
    const headers = new Headers({ host: HOST, origin: "https://evil.example" });
    headers.set("x-forwarded-for", freshIp());
    const res = await middleware(
      new NextRequest(`${ORIGIN}/api/ocr-unified`, { method: "POST", headers })
    );
    expect(res.status).toBe(403);
  });
});

describe("observe mode rejects nothing new", () => {
  it("lets a rate-limited caller through, and says so", async () => {
    process.env.SECURITY_MODE = "observe";
    const cookie = await signSession({
      id: "observed-device",
      propertyCode: "default",
      iat: Date.now(),
    });
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await middleware(upload({ cookie, ip }))).status);
    }
    // Enforcing, /api/ocr-unified would start rejecting at the 13th call.
    expect(statuses).not.toContain(429);
  });

  it("still enforces in the default mode", async () => {
    const cookie = await signSession({
      id: "enforced-device",
      propertyCode: "default",
      iat: Date.now(),
    });
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await middleware(upload({ cookie, ip }))).status);
    }
    expect(statuses).toContain(429);
  });

  it("accepts an unrecognised upload with a usable type rather than a null one", async () => {
    // Returning ok with detectedType null would still fail in the route, so
    // observe mode would reject after all.
    process.env.SECURITY_MODE = "observe";
    const policy = getRoutePolicy("/api/ocr-unified")!;
    const gif = new Uint8Array(64);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
    const read = await readValidatedFile(
      new File([gif], "scan.jpg", { type: "image/jpeg" }),
      policy
    );
    expect(read.ok).toBe(true);
    expect(read.detectedType).toBeTruthy();
    expect(read.bytes).toBeTruthy();
  });

  it("rejects that same upload when enforcing", async () => {
    const policy = getRoutePolicy("/api/ocr-unified")!;
    const gif = new Uint8Array(64);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
    const read = await readValidatedFile(
      new File([gif], "scan.jpg", { type: "image/jpeg" }),
      policy
    );
    expect(read.ok).toBe(false);
    expect(read.code).toBe("unsupported_file_type");
  });
});

describe("structural gates stay on in both modes", () => {
  it("still refuses an unknown /api path in observe mode", async () => {
    process.env.SECURITY_MODE = "observe";
    const headers = new Headers({ host: HOST, origin: ORIGIN });
    headers.set("x-forwarded-for", freshIp());
    const res = await middleware(
      new NextRequest(`${ORIGIN}/api/not-a-route`, { method: "POST", headers })
    );
    expect(res.status).toBe(400);
  });

  it("still refuses a wrong method in observe mode", async () => {
    process.env.SECURITY_MODE = "observe";
    const headers = new Headers({ host: HOST, origin: ORIGIN });
    headers.set("x-forwarded-for", freshIp());
    const res = await middleware(
      new NextRequest(`${ORIGIN}/api/ocr-unified`, { method: "GET", headers })
    );
    expect(res.status).toBe(405);
  });
});
