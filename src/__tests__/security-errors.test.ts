/**
 * Fix: errors leak no stack traces, table names or provider details.
 *
 * The routes were already careful — AiError text is never echoed, only canned
 * strings — with one real exception: every OCR route answered a missing key
 * with "OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)", naming
 * both the provider and the variable to anyone who asked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  securityError,
  statusForCode,
  containsLeak,
  allSecurityMessages,
} from "@/lib/security/errors";

const API_DIR = path.resolve(__dirname, "../app/api");

function routeSources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        out.push({ file: path.relative(API_DIR, full), src: readFileSync(full, "utf8") });
      }
    }
  };
  walk(API_DIR);
  return out;
}

describe("error bodies", () => {
  it("carry a stable code beside the sentence", () => {
    const body = securityError("rate_limited", 30);
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfter).toBe(30);
    expect(typeof body.error).toBe("string");
  });

  it("omit retryAfter where it does not apply", () => {
    expect(securityError("invalid_request").retryAfter).toBeUndefined();
    expect(securityError("rate_limited", 0).retryAfter).toBeUndefined();
  });

  it("map each code to a sensible status", () => {
    expect(statusForCode("unauthenticated")).toBe(401);
    expect(statusForCode("cross_origin_denied")).toBe(403);
    expect(statusForCode("method_not_allowed")).toBe(405);
    expect(statusForCode("rate_limited")).toBe(429);
    expect(statusForCode("payload_too_large")).toBe(413);
    expect(statusForCode("too_many_pages")).toBe(413);
    expect(statusForCode("budget_exceeded")).toBe(402);
    expect(statusForCode("unsupported_file_type")).toBe(400);
    expect(statusForCode("service_unconfigured")).toBe(500);
  });

  it("give the spend cap an actionable message", () => {
    expect(securityError("budget_exceeded", 1000).error).toMatch(/limit/i);
  });
});

describe("no infrastructure detail reaches the client", () => {
  it("keeps every canned message clean", () => {
    for (const m of allSecurityMessages()) expect(containsLeak(m)).toBe(false);
  });

  it("names neither the provider nor an environment variable", () => {
    for (const m of allSecurityMessages()) {
      expect(m.toLowerCase()).not.toContain("mistral");
      expect(m).not.toContain("MISTRAL_API_KEY");
      expect(m.toLowerCase()).not.toContain("supabase");
    }
  });

  it("detects the leak shapes it exists to catch", () => {
    // Guards the guard: if these stop matching, the assertions above are vacuous.
    expect(containsLeak("MISTRAL_API_KEY manquant")).toBe(true);
    expect(containsLeak("select * from ai_spend")).toBe(true);
    expect(containsLeak("at processChunk (/home/user/app/route.ts:12:9)")).toBe(true);
    expect(containsLeak("/var/task/node_modules/next/server.js")).toBe(true);
    expect(containsLeak("supabase connection refused")).toBe(true);
    expect(containsLeak("service_role key rejected")).toBe(true);
    expect(containsLeak("That file is too large.")).toBe(false);
  });
});

describe("the routes themselves", () => {
  const routes = routeSources();

  it("finds every route file", () => {
    expect(routes.length).toBe(7);
  });

  it("no longer answers with the provider's env var name", () => {
    for (const { file, src } of routes) {
      expect(src, `${file} still names MISTRAL_API_KEY to the client`).not.toContain(
        "MISTRAL_API_KEY manquant"
      );
    }
  });

  it("never echoes an AiError message to the client", () => {
    // AiError text carries "Mistral <path> failed: HTTP <status> — <body>", so
    // it names the provider and our account's state with it. Branching on
    // err.status to pick between canned strings is fine and is what the routes
    // do; interpolating the message is not.
    for (const { file, src } of routes) {
      expect(src, `${file} references err.message`).not.toContain("err.message");
      expect(src, `${file} stringifies the error`).not.toContain("String(err)");
      expect(src, `${file} interpolates the error`).not.toMatch(/\$\{\s*err\b/);
    }
  });

  it("never echoes an uploaded file name back to the caller", () => {
    // file.name is caller input and can carry a guest's name; the morning-brief
    // route used to return it in three separate error strings.
    for (const { file, src } of routes) {
      expect(src, `${file} echoes file.name`).not.toMatch(
        /error:\s*`[^`]*\$\{\s*file\.name/
      );
    }
  });
});
