/**
 * The app must execute in the EU.
 *
 * It ran in `iad1` — US East, Virginia — which meant every guest name in an
 * uploaded roster was processed on US soil. Pinning the region in the repo
 * rather than only in the Vercel dashboard means the setting is reviewable,
 * survives a project being recreated, and cannot be moved back without a commit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const config = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")
);

/** Vercel's EU region codes. */
const EU_REGIONS = ["cdg1", "fra1", "arn1", "dub1", "lhr1"];

describe("deployment region", () => {
  it("is pinned, not left to the platform default", () => {
    // Unpinned means iad1, which is where this started.
    expect(Array.isArray(config.regions)).toBe(true);
    expect(config.regions.length).toBeGreaterThan(0);
  });

  it("is Paris — the same country as the OCR provider", () => {
    expect(config.regions).toContain("cdg1");
  });

  it("names no region outside the EU", () => {
    for (const r of config.regions) {
      expect(EU_REGIONS, `${r} is not an EU region`).toContain(r);
    }
  });
});
