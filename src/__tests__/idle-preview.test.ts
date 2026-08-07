import { describe, it, expect } from "vitest";
import { idlePreviewEnabled, swipeEnabled } from "@/lib/gestures";

/**
 * US-35 — the resting frame is off until asked for.
 *
 * It shipped on, because an empty band above the pad looked unfinished from a
 * desktop browser. With a real day on a real tablet the answer came back the
 * other way: at rest reception is looking at the pad, not at a list of who has
 * already come down.
 *
 * These two preferences default in opposite directions, and both are right for
 * their own reason — which is why the defaults are asserted rather than
 * assumed.
 */
describe("idlePreviewEnabled", () => {
  it("is off when nobody has said otherwise", () => {
    expect(idlePreviewEnabled(null)).toBe(false);
    expect(idlePreviewEnabled({})).toBe(false);
  });

  it("is on only when it was turned on", () => {
    expect(idlePreviewEnabled({ idlePreview: true })).toBe(true);
    expect(idlePreviewEnabled({ idlePreview: false })).toBe(false);
  });

  it("does not read silence the way the swipe does", () => {
    // The swipe takes nothing away when it is on, so silence means yes there.
    // A frame at rest takes half the screen, so silence means no here.
    expect(swipeEnabled({})).toBe(true);
    expect(idlePreviewEnabled({})).toBe(false);
  });
});
