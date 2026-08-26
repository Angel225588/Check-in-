/**
 * Who may call the API routes.
 *
 * This test exists because the first attempt at hardening these routes took
 * the app down. The audit was right that `if (apiToken) { ...check... }` meant
 * an unset variable disabled the check entirely. The fix — refuse in
 * production when the token is missing — was wrong twice:
 *
 *  1. The variable is not set on any deployment, so every upload returned
 *     `server_misconfigured` and reception could not load a roster.
 *  2. Setting it would have failed too. These routes are called by the
 *     tablet's own browser, which sends no Authorization header, and a secret
 *     the browser must present cannot stay secret.
 *
 * So: the token is optional (for server-to-server callers), and same-origin is
 * enforced for everyone else.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const MIDDLEWARE = readFileSync(path.resolve(__dirname, "../middleware.ts"), "utf8");

/** Rebuild `isSameOrigin` from source and drive it with fake headers. */
function sameOrigin(headers: Record<string, string | null>): boolean {
  const src = MIDDLEWARE.slice(
    MIDDLEWARE.indexOf("function isSameOrigin"),
    MIDDLEWARE.indexOf("function makeNonce")
  )
    // Strip the TypeScript annotations so the body evaluates as plain JS.
    .replace(/function isSameOrigin\(request: NextRequest\): boolean/, "function isSameOrigin(request)")
    .replace(/ as string\[\]/g, "");

  const fn = new Function("request", `${src}; return isSameOrigin(request);`);
  return fn({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as boolean;
}

const HOST = "check-in-pdj.vercel.app";

describe("the reception tablet can reach the API", () => {
  it("accepts a POST from a page the app served", () => {
    // What the browser actually sends on `fetch("/api/ocr-pdf", {method:"POST"})`.
    expect(sameOrigin({ host: HOST, origin: `https://${HOST}` })).toBe(true);
  });

  it("accepts a request carrying only a Referer", () => {
    expect(sameOrigin({ host: HOST, referer: `https://${HOST}/upload` })).toBe(true);
  });

  it("accepts the app on a preview deployment, whose host differs", () => {
    const preview = "check-in-git-main-angels-projects-b0896f69.vercel.app";
    expect(sameOrigin({ host: preview, origin: `https://${preview}` })).toBe(true);
  });
});

describe("nobody else can", () => {
  it("refuses curl, which sends neither Origin nor Referer", () => {
    expect(sameOrigin({ host: HOST })).toBe(false);
  });

  it("refuses a hostile page on another domain", () => {
    expect(sameOrigin({ host: HOST, origin: "https://evil.example" })).toBe(false);
  });

  it("refuses a lookalike host", () => {
    expect(sameOrigin({ host: HOST, origin: "https://check-in-pdj.vercel.app.evil.example" })).toBe(false);
  });

  it("refuses a Referer from another domain", () => {
    expect(sameOrigin({ host: HOST, referer: "https://evil.example/steal" })).toBe(false);
  });

  it("refuses a malformed Origin rather than throwing", () => {
    expect(sameOrigin({ host: HOST, origin: "not a url" })).toBe(false);
  });

  it("refuses when the request carries no Host at all", () => {
    expect(sameOrigin({ origin: `https://${HOST}` })).toBe(false);
  });
});

describe("the shape of the gate", () => {
  it("never returns a blanket 500 for a missing token", () => {
    // That is the regression this file exists to prevent: an unset variable
    // took the whole API down rather than narrowing who could call it. The
    // history is written in a comment above the gate, so comments are stripped
    // before checking — otherwise the explanation would fail the test.
    const code = MIDDLEWARE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("server_misconfigured");
    expect(code).not.toMatch(/status:\s*500/);
  });

  it("still honours a token when one IS configured", () => {
    // Server-to-server callers can hold a secret; browsers cannot.
    expect(MIDDLEWARE).toMatch(/if \(apiToken\) \{/);
    expect(MIDDLEWARE).toContain("Unauthorized");
  });

  it("falls back to same-origin when no token is configured", () => {
    expect(MIDDLEWARE).toMatch(/else if \(!isSameOrigin\(request\)\)/);
    expect(MIDDLEWARE).toContain("cross_origin_denied");
  });

  it("says plainly that this is not authentication", () => {
    // The comment is load-bearing. Someone will read this gate and assume the
    // routes are protected; they are narrowed, not authenticated, until the
    // Supabase Auth work lands.
    expect(MIDDLEWARE).toMatch(/not authentication/i);
  });
});
