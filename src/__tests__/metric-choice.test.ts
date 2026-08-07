import { describe, it, expect } from "vitest";
import { chooseMetrics, toggleMetric, CORE_METRICS } from "@/lib/metric-choice";

/**
 * US-19 — reception picks what the bar shows.
 *
 * The funnel used to be a second way to filter. It is now a checklist of what
 * is ON the bar, which is what reception actually wanted: the bar is four
 * slots wide and which four is a matter of taste, the day, and who is at the
 * desk. Filtering stays where it belongs — you tap the pill itself.
 *
 * Two things must never be true. A day cannot end up with an empty bar, and a
 * metric that is chosen but absent from the day (no children, no groups) must
 * not hold a slot to display a zero.
 */
describe("chooseMetrics", () => {
  const day = [
    { key: "total", value: 207 },
    { key: "entered", value: 178 },
    { key: "remaining", value: 29 },
    { key: "expected", value: 188 },
    { key: "children", value: 11 },
    { key: "groups", value: 62 },
    { key: "comp", value: 4 },
    { key: "vip", value: 15 },
  ];

  it("falls back to the ranking when nothing has been chosen", () => {
    const { shown } = chooseMetrics(day, null, 100, 4);
    expect(shown.slice(0, 3)).toEqual(["total", "entered", "remaining"]);
    expect(shown).toHaveLength(4);
  });

  it("honours the choice, in the order it was chosen", () => {
    const { shown } = chooseMetrics(day, ["vip", "groups", "total"], 100, 4);
    expect(shown).toEqual(["vip", "groups", "total"]);
  });

  it("never shows a chosen metric the day has none of", () => {
    const quiet = [
      { key: "total", value: 207 },
      { key: "children", value: 0 },
      { key: "groups", value: 0 },
    ];
    const { shown } = chooseMetrics(quiet, ["children", "groups", "total"], 100, 4);
    expect(shown).toEqual(["total"]);
  });

  it("falls back rather than leave the bar empty", () => {
    const { shown } = chooseMetrics(day, ["children"], 100, 4);
    expect(shown).toContain("children");
    // Choosing one thing is allowed; choosing nothing that exists is not.
    const { shown: none } = chooseMetrics(day, [], 100, 4);
    expect(none.length).toBeGreaterThan(0);
    expect(none.slice(0, 3)).toEqual(["total", "entered", "remaining"]);
  });

  it("stops at the number of slots the screen has", () => {
    const { shown } = chooseMetrics(day, ["vip", "groups", "comp", "children", "total"], 100, 3);
    expect(shown).toHaveLength(3);
  });

  it("reports what is left over, so the funnel can count it", () => {
    const { hidden } = chooseMetrics(day, ["total", "entered", "remaining", "vip"], 100, 4);
    expect(hidden).toEqual(expect.arrayContaining(["expected", "children", "groups", "comp"]));
    expect(hidden).not.toContain("total");
  });
});

describe("toggleMetric", () => {
  it("starts from what is on screen, so the first tap edits what you see", () => {
    // Nothing chosen yet: toggling ADDS to the current visible set rather than
    // creating a list of one and blanking the bar.
    expect(toggleMetric(null, "vip", ["total", "entered", "remaining", "groups"]))
      .toEqual(["total", "entered", "remaining", "groups", "vip"]);
  });

  it("adds at the end and removes in place", () => {
    expect(toggleMetric(["total", "vip"], "groups", [])).toEqual(["total", "vip", "groups"]);
    expect(toggleMetric(["total", "vip", "groups"], "vip", [])).toEqual(["total", "groups"]);
  });

  it("refuses to remove the last one standing", () => {
    expect(toggleMetric(["vip"], "vip", [])).toEqual(["vip"]);
  });

  it("keeps the outcome trio nameable", () => {
    expect(CORE_METRICS).toEqual(["total", "entered", "remaining"]);
  });
});
