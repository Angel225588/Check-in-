/**
 * The Content Security Policy, as it actually ships.
 *
 * This matters more than it used to. Guest names and room numbers are
 * encrypted in browser storage, and that encryption deliberately does not
 * defend against code running inside the page — such code can just call
 * `secureGet`. So script injection is the residual path to guest data, and
 * `script-src` is the wall in front of it. `'unsafe-inline'` there would take
 * the wall down.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// The policy moved from next.config.ts into the middleware when it gained a
// per-request nonce: a static header cannot carry one.
const MIDDLEWARE = readFileSync(path.resolve(__dirname, "../middleware.ts"), "utf8");

/**
 * Rebuild the policy the same way the config does, for the given mode.
 *
 * The helper is a pure function of NODE_ENV, so its source is evaluated with a
 * shadowed `process` rather than importing a Next config into jsdom — and
 * rather than mutating the real `process.env`, which Node refuses.
 */
function policyFor(mode: "development" | "production", nonce = "TEST-NONCE"): string {
  // Matched loosely: the handler gained `async` when device-identity signing
  // landed, and a literal marker silently sliced to -1 when it did.
  const handlerAt = MIDDLEWARE.search(/export\s+(?:async\s+)?function middleware/);
  const src = MIDDLEWARE.slice(MIDDLEWARE.indexOf("function cspWithNonce"), handlerAt)
    // Strip the TypeScript annotations so the body evaluates as JS.
    .replace(/function cspWithNonce\(nonce: string\): string/, "function cspWithNonce(nonce)");

  const fn = new Function("process", "nonce", `${src}; return cspWithNonce(nonce);`);
  return fn({ env: { NODE_ENV: mode } }, nonce) as string;
}

function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(name + " "));
  return found ?? "";
}

describe("the policy that ships", () => {
  let prod = "";
  beforeEach(() => { prod = policyFor("production"); });

  it("allows no inline script", () => {
    expect(directive(prod, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("carries a nonce, without which Next's own scripts are blocked", () => {
    // Removing 'unsafe-inline' with no nonce renders every page blank: Next
    // emits inline scripts to hydrate React. The browser smoke test
    // (scripts/csp-smoke.mjs) is what caught that; this keeps it caught.
    expect(directive(prod, "script-src")).toContain("'nonce-TEST-NONCE'");
  });

  it("allows no eval", () => {
    // 'wasm-unsafe-eval' is a different thing and is allowed — see below.
    const scriptSrc = directive(prod, "script-src");
    expect(scriptSrc.replace(/'wasm-unsafe-eval'/g, "")).not.toContain("unsafe-eval");
  });

  it("still permits WebAssembly, so local OCR keeps working", () => {
    // The local mode is the one where guest data never leaves the device.
    // Breaking it to tighten the CSP would trade privacy for privacy.
    expect(directive(prod, "script-src")).toContain("'wasm-unsafe-eval'");
  });

  it("blocks plugins, base-tag hijacking and off-site form posts", () => {
    expect(directive(prod, "object-src")).toContain("'none'");
    expect(directive(prod, "base-uri")).toContain("'self'");
    expect(directive(prod, "form-action")).toContain("'self'");
  });

  it("refuses to be framed", () => {
    expect(directive(prod, "frame-ancestors")).toContain("'none'");
  });

  it("names no retired endpoint", () => {
    // Gemini was removed from the app in the Mistral migration; the CSP kept
    // allowing it for months afterwards.
    expect(prod).not.toContain("generativelanguage.googleapis.com");
  });

  it("permits workers from blob:, which tesseract.js needs", () => {
    expect(directive(prod, "worker-src")).toContain("blob:");
  });
});

describe("development is allowed to be loose, production is not", () => {
  it("keeps eval in dev, because fast refresh needs it", () => {
    expect(policyFor("development")).toContain("'unsafe-eval'");
  });

  it("differs from production, so the strict policy is not accidentally dev-only", () => {
    expect(policyFor("development")).not.toBe(policyFor("production"));
  });
});

describe("no inline script is left in the app", () => {
  it("mints a fresh nonce per request rather than reusing one", () => {
    // A constant nonce is the same as 'unsafe-inline' with extra steps.
    expect(MIDDLEWARE).toMatch(/crypto\.getRandomValues/);
    expect(policyFor("production", "A")).not.toBe(policyFor("production", "B"));
  });

  it("layout.tsx loads the theme bootstrap from a file", () => {
    // An inline script here would need 'unsafe-inline' and would reopen the
    // whole policy for one line of theme code.
    const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toContain('src="/theme-init.js"');
    expect(layout).not.toMatch(/<Script[^>]*>\s*\{`/);
  });

  it("ships that bootstrap as a real file", () => {
    const js = readFileSync(path.resolve(__dirname, "../../public/theme-init.js"), "utf8");
    expect(js).toContain("app-dark");
  });

  it("uses no dangerouslySetInnerHTML for scripts anywhere", () => {
    const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).not.toContain("dangerouslySetInnerHTML");
  });
});
