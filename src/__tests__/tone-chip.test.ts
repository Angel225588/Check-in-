import { describe, it, expect } from "vitest";
import { toneChipStyle, TONES_FOR_CHIPS } from "@/lib/note-tone";

/**
 * US-31 — the filter chips are readable in both themes.
 *
 * "Tout" was selected and invisible: near-black ink (#1C1C1C) on a
 * near-black panel, with a black ring nobody could see either. The chip was
 * doing its job — it just could not say so.
 *
 * The cause is worth naming, because it is not a colour mistake. Every OTHER
 * chip took its colour from a tone, and tones come from `--aur-*` tokens which
 * flip with the theme. "Tout" has no tone, so it had been given a literal — and
 * a literal is a colour that has only ever been checked against one background.
 */
describe("toneChipStyle", () => {
  const styles = [...TONES_FOR_CHIPS, "all" as const].flatMap((t) => [
    toneChipStyle(t, true),
    toneChipStyle(t, false),
  ]);

  it("never paints a chip with a literal ink", () => {
    for (const s of styles) {
      const paint = [s.color, s.background, s.boxShadow ?? ""].join(" ");
      // A hex or a pure-black rgba is a colour picked against one background.
      expect(paint, paint).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(paint, paint).not.toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0/);
    }
  });

  it("makes the selected chip look selected", () => {
    for (const t of [...TONES_FOR_CHIPS, "all" as const]) {
      const on = toneChipStyle(t, true);
      const off = toneChipStyle(t, false);
      expect(on.background).not.toBe(off.background);
      expect(on.color).not.toBe(off.color);
      // The ring is what survives when the wash is a 10% tint.
      expect(on.boxShadow).toBeTruthy();
    }
  });

  it("gives 'Tout' the same treatment as a tone, not a special case", () => {
    const all = toneChipStyle("all", true);
    expect(all.color).toMatch(/^var\(--/);
    expect(all.background).toMatch(/^var\(--/);
  });

  it("keeps the idle chip on a neutral that reads on either ground", () => {
    const idle = toneChipStyle("alert", false);
    // Grey at low alpha sits on cream and on charcoal alike; black does not.
    expect(idle.background).toMatch(/128\s*,\s*128\s*,\s*128/);
    expect(idle.color).toBe("var(--tab-idle)");
  });
});
