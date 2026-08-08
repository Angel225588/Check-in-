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
afterEach(() => { process.env.NEXT_PUBLIC_TEST_TOOLS = original; });

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
