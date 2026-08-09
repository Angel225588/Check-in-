import { describe, it, expect } from "vitest";
import { chooseMetrics, toggleMetric, CORE_METRICS } from "@/lib/metric-choice";

/**
 * US-19 — reception picks what the bar shows.
 *
 * The funnel used to be a second way to filter. It is now a checklist of what
 * is ON the bar, which is what reception actually wanted: the bar is a handful
 * of slots wide and which ones is a matter of the day and who is at the desk.
 * Filtering stays where it belongs — you tap the pill itself.
 *
 * The shape changed after a morning at the desk. FOUR are pinned — Total,
 * Entrés, Restants, COMP — because they are not preferences: they answer "where
 * are we" and "what am I accounting for", and reception should never have to
 * put them back. The checklist decides the rest, which is the only part of the
 * bar anyone wanted to choose.
 *
 * Two things must never be true. A day cannot end up with an empty bar, and a
 * chosen metric the day has none of must not hold a slot to display a zero.
 * (The pinned four are exempt: an empty Entrés at 06:40 is information.)
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

  it("leads with the pinned four when nothing has been chosen", () => {
    const { shown } = chooseMetrics(day, null, 100, 6);
    expect(shown.slice(0, 4)).toEqual(CORE_METRICS);
    expect(shown).toHaveLength(6);
  });

  it("honours the choice for the slots that are actually a choice", () => {
    const { shown } = chooseMetrics(day, ["vip", "groups"], 100, 6);
    expect(shown).toEqual([...CORE_METRICS, "vip", "groups"]);
  });

  it("ignores an attempt to choose a pinned metric — it is already there", () => {
    const { shown } = chooseMetrics(day, ["total", "vip"], 100, 6);
    expect(shown).toEqual([...CORE_METRICS, "vip"]);
  });

  it("never shows a chosen metric the day has none of", () => {
    const quiet = [
      { key: "total", value: 207 },
      { key: "children", value: 0 },
      { key: "groups", value: 0 },
    ];
    const { shown } = chooseMetrics(quiet, ["children", "groups"], 100, 4);
    expect(shown).toEqual(["total"]);
  });

  it("treats an emptied checklist as a choice, not as an accident", () => {
    // null is "nobody has ever chosen" and falls back to the ranking. [] is
    // "someone unticked everything" — honoured, because the pinned four are
    // still a bar. Conflating them put back what had just been removed.
    const { shown: never } = chooseMetrics(day, null, 100, 6);
    expect(never.length).toBe(6);
    const { shown: emptied } = chooseMetrics(day, [], 100, 6);
    expect(emptied).toEqual(CORE_METRICS);
  });

  it("stops at the number of slots the screen has", () => {
    const { shown } = chooseMetrics(day, ["vip", "groups", "children", "expected"], 100, 5);
    expect(shown).toHaveLength(5);
    expect(shown.slice(0, 4)).toEqual(CORE_METRICS);
  });

  it("reports what is left over, so the funnel can count it", () => {
    const { hidden } = chooseMetrics(day, ["vip"], 100, 5);
    expect(hidden).toEqual(expect.arrayContaining(["expected", "children", "groups"]));
    expect(hidden).not.toContain("total");
    expect(hidden).not.toContain("comp");
  });
});

describe("toggleMetric", () => {
  const day = [
    { key: "total", value: 207 },
    { key: "entered", value: 178 },
    { key: "remaining", value: 29 },
    { key: "comp", value: 4 },
    { key: "groups", value: 62 },
    { key: "vip", value: 15 },
    { key: "children", value: 11 },
  ];

  it("starts from what is on screen, minus the pinned, so the first tap is sane", () => {
    expect(toggleMetric(null, "vip", [...CORE_METRICS, "groups"])).toEqual(["groups", "vip"]);
  });

  it("adds at the end and removes in place", () => {
    expect(toggleMetric(["vip"], "groups", [])).toEqual(["vip", "groups"]);
    expect(toggleMetric(["vip", "groups"], "vip", [])).toEqual(["groups"]);
  });

  it("lets the optional list empty out — the pinned four are still a bar", () => {
    expect(toggleMetric(["vip"], "vip", [])).toEqual([]);
  });

  it("does nothing when a pinned metric is tapped", () => {
    expect(toggleMetric(["vip"], "total", [], 6, day, 100)).toEqual(["vip"]);
  });

  it("names the pinned four", () => {
    expect(CORE_METRICS).toEqual(["total", "entered", "remaining", "comp"]);
  });
});
