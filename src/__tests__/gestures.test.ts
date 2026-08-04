import { describe, it, expect } from "vitest";
import { swipeEnabled } from "@/lib/gestures";

/**
 * US-23 — a gesture is a shortcut for whoever knows it, never the only path.
 *
 * The setting exists because the tablet lies flat on the desk and gets brushed
 * by trays and sleeves during service. Turning swipe off must cost nothing:
 * every face is still on a dot.
 */
describe("swipeEnabled", () => {
  it("is on by default — the surprise is the good part", () => {
    expect(swipeEnabled(undefined)).toBe(true);
    expect(swipeEnabled(null)).toBe(true);
    expect(swipeEnabled({})).toBe(true);
  });

  it("stays on when the stored settings predate the toggle", () => {
    expect(swipeEnabled({ handSide: "right" })).toBe(true);
  });

  it("is off only when it was explicitly turned off", () => {
    expect(swipeEnabled({ swipe: false })).toBe(false);
  });

  it("is on when explicitly turned back on", () => {
    expect(swipeEnabled({ swipe: true })).toBe(true);
  });
});
