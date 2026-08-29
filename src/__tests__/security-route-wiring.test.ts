/**
 * Every route is actually wired to the guard.
 *
 * The unit tests prove the primitives work. This proves the routes use them —
 * the failure mode a new route introduces is not a broken check but a missing
 * one, and that is invisible to a test of the check itself.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { ROUTE_POLICIES } from "@/lib/security/config";

const API_DIR = path.resolve(__dirname, "../app/api");

/**
 * Comments are stripped before any assertion. The routes explain *why* they no
 * longer trust `file.type`, and matching raw source made that explanation
 * satisfy the check that the code no longer does it.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function routeFiles(): { route: string; src: string }[] {
  const out: { route: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        const rel = path.relative(API_DIR, path.dirname(full));
        out.push({
          route: `/api/${rel.split(path.sep).join("/")}`,
          src: stripComments(readFileSync(full, "utf8")),
        });
      }
    }
  };
  walk(API_DIR);
  return out;
}

const ROUTES = routeFiles();
const AI_ROUTES = ROUTES.filter(
  (r) => ROUTE_POLICIES.find((p) => p.path === r.route)?.callsAi
);

describe("policy table matches the filesystem", () => {
  it("has an entry for every route that exists", () => {
    const onDisk = ROUTES.map((r) => r.route).sort();
    const declared = ROUTE_POLICIES.map((p) => p.path).sort();
    // A route with no entry is denied by the middleware, so a mismatch is a
    // dead endpoint rather than an open one — but it is still a mistake.
    expect(declared).toEqual(onDisk);
  });

  it("finds the five AI routes", () => {
    expect(AI_ROUTES.map((r) => r.route).sort()).toEqual([
      "/api/ocr",
      "/api/ocr-morning-brief",
      "/api/ocr-pdf",
      "/api/ocr-unified",
      "/api/verify-extraction",
    ]);
  });
});

describe("every AI route reserves before it spends", () => {
  it("holds budget", () => {
    for (const { route, src } of AI_ROUTES) {
      expect(src, `${route} does not reserve budget`).toContain("holdBudget(");
    }
  });

  it("settles the hold on success", () => {
    for (const { route, src } of AI_ROUTES) {
      expect(src, `${route} never commits its reservation`).toContain("settleOk(");
    }
  });

  it("releases only when the provider was never reached", () => {
    // Releasing after a failed call would let repeated failures spend without
    // being counted: a part-way OCR still bills for the pages it processed.
    for (const { route, src } of AI_ROUTES) {
      expect(src, `${route} has no providerCalled guard`).toMatch(
        /!settled && !providerCalled\) await settleFailed\(hold\)/
      );
      expect(src, `${route} never sets providerCalled`).toMatch(
        /providerCalled = true;/
      );
    }
  });
});

describe("every upload route validates by content", () => {
  const UPLOAD_ROUTES = AI_ROUTES.filter((r) => r.route !== "/api/verify-extraction");

  it("reads uploads through the guard", () => {
    for (const { route, src } of UPLOAD_ROUTES) {
      expect(src, `${route} does not use readValidatedFile`).toContain(
        "readValidatedFile"
      );
    }
  });

  it("no longer trusts the client-supplied content type", () => {
    for (const { route, src } of AI_ROUTES) {
      expect(src, `${route} still reads file.type`).not.toMatch(/\bfile\.type\b/);
    }
  });

  it("no longer carries its own size constant", () => {
    // Limits live in the policy table, so they cannot drift per route.
    for (const { route, src } of AI_ROUTES) {
      expect(src, `${route} still defines MAX_FILE_SIZE`).not.toMatch(
        /const MAX_(FILE_SIZE|BODY_SIZE)/
      );
    }
  });

  it("reads the JSON body through the guard where there is no file", () => {
    const verify = AI_ROUTES.find((r) => r.route === "/api/verify-extraction")!;
    expect(verify.src).toContain("readJsonBody");
    // The bypass this replaced: trusting the content-length header alone.
    expect(verify.src).not.toMatch(/parseInt\(request\.headers\.get\("content-length"\)/);
  });
});

describe("the privacy routes bind the actor to something unforgeable", () => {
  const PRIVACY = ROUTES.filter((r) => r.route.startsWith("/api/privacy/"));

  it("covers both routes", () => {
    expect(PRIVACY.map((r) => r.route).sort()).toEqual([
      "/api/privacy/erase",
      "/api/privacy/export",
    ]);
  });

  it("does not take the caller's word for who is acting", () => {
    for (const { route, src } of PRIVACY) {
      expect(src, `${route} trusts body.actor alone`).toContain("verifySession(");
      expect(src, `${route} does not bind a device`).toContain("actorRef");
    }
  });

  it("does not take the caller's word for which property either", () => {
    // An unscoped export is a cross-tenant read — see docs/GDPR-AUDIT.md §2.
    for (const { route, src } of PRIVACY) {
      expect(src, `${route} trusts body.propertyCode`).toContain("property_mismatch");
    }
  });

  it("bounds the request body", () => {
    for (const { route, src } of PRIVACY) {
      expect(src, `${route} reads an unbounded body`).toContain("readJsonBody");
    }
  });
});
