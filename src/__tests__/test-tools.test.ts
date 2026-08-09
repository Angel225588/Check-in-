import { describe, it, expect, afterEach } from "vitest";
import { testToolsEnabled } from "@/lib/test-tools";

/**
 * The demo loader must not exist on the tablet reception uses.
 *
 * "Charger un service de démo" replaces today's data. During a real service
 * that is the morning gone in one tap, with no undo — so the tools ship only
 * when a build explicitly asks for them, and anything ambiguous means off.
 */
const original = process.env.NEXT_PUBLIC_TEST_TOOLS;
const originalEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
afterEach(() => {
  process.env.NEXT_PUBLIC_TEST_TOOLS = original;
  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_VERCEL_ENV;
  else process.env.NEXT_PUBLIC_VERCEL_ENV = originalEnv;
});

describe("testToolsEnabled", () => {
  it("is off when the flag is not set — which is what production is", () => {
    delete process.env.NEXT_PUBLIC_TEST_TOOLS;
    expect(testToolsEnabled()).toBe(false);
  });

  it("is on only for an exact opt-in", () => {
    process.env.NEXT_PUBLIC_TEST_TOOLS = "1";
    expect(testToolsEnabled()).toBe(true);
  });

  it("treats every other value as off, including the plausible ones", () => {
    // "true", "yes", "0", "" — a flag that guesses is a flag that ships the
    // demo loader to a desk one typo later.
    for (const v of ["true", "yes", "0", "", "false", "TEST"]) {
      process.env.NEXT_PUBLIC_TEST_TOOLS = v;
      expect(testToolsEnabled(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });
});

/**
 * The flag lives in a dashboard someone else can edit.
 *
 * Everything above proves the code is correct for the value it is given, and
 * proves nothing about what value the hosting provider hands it — one person
 * adding NEXT_PUBLIC_TEST_TOOLS=1 to the production environment puts "replace
 * today's data" back on reception's tablet, and no test in this repo would
 * notice. So production refuses the tools even when asked.
 */
describe("testToolsEnabled on a production deployment", () => {
  it("stays off even when the flag says yes", () => {
    process.env.NEXT_PUBLIC_TEST_TOOLS = "1";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    expect(testToolsEnabled()).toBe(false);
  });

  it("still allows preview deployments, which is where we rehearse", () => {
    process.env.NEXT_PUBLIC_TEST_TOOLS = "1";
    for (const env of ["preview", "development"]) {
      process.env.NEXT_PUBLIC_VERCEL_ENV = env;
      expect(testToolsEnabled(), env).toBe(true);
    }
  });

  it("still allows a local build, where there is no deployment at all", () => {
    // The harnesses build with NEXT_PUBLIC_TEST_TOOLS=1 on this machine and
    // must keep working; an absent Vercel env is not a production env.
    process.env.NEXT_PUBLIC_TEST_TOOLS = "1";
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    expect(testToolsEnabled()).toBe(true);
  });
});
