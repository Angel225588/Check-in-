import { describe, it, expect } from "vitest";
import {
  CORE_METRICS,
  chooseMetrics,
  toggleMetric,
  isPinned,
  isTicked,
} from "@/lib/metric-choice";
import type { MetricCandidate } from "@/lib/portrait";

/**
 * "I selected group and it was selecting vip or children and not group. I had
 * to actually unmark an existing one to then be able to click group."
 *
 * Two faults, compounding.
 *
 * The checkbox was drawn from `shown` — the list ALREADY TRUNCATED to the slots
 * on the bar. A metric that had been chosen but did not fit rendered as an empty
 * box; tapping it told `toggleMetric` to REMOVE something already in the list,
 * so the box stayed empty and the tap did nothing. Unticking something else made
 * room, the hidden choice appeared, and the control looked possessed.
 *
 * And the bar displaced "the least parlante" metric by ranking. From the desk
 * that is invisible: ticking Groupes made VIP's tick vanish, which reads as
 * having selected VIP.
 *
 * So: the tick shows what is CHOSEN, four metrics are pinned and cannot be
 * knocked off by anything, and when the optional slots are full the one that
 * leaves is the one chosen longest ago — a rule reception can predict.
 */
const cand = (key: string, value: number): MetricCandidate => ({ key, value }) as MetricCandidate;

const ALL: MetricCandidate[] = [
  cand("total", 100),
  cand("entered", 60),
  cand("remaining", 40),
  cand("comp", 4),
  cand("vip", 6),
  cand("children", 9),
  cand("groups", 40),
  cand("notincluded", 12),
];

describe("the pinned four", () => {
  it("pins total, entrés, restants and COMP", () => {
    expect(CORE_METRICS).toEqual(["total", "entered", "remaining", "comp"]);
  });

  it("keeps all four on the bar whatever was chosen", () => {
    const { shown } = chooseMetrics(ALL, ["groups", "vip"], 100, 6);
    for (const k of CORE_METRICS) expect(shown, k).toContain(k);
  });

  it("keeps COMP even on a day with none — zero comps is information", () => {
    const none = ALL.map((m) => (m.key === "comp" ? cand("comp", 0) : m));
    expect(chooseMetrics(none, null, 100, 6).shown).toContain("comp");
  });

  it("refuses to unpin one", () => {
    const next = toggleMetric(["groups"], "comp", ["total", "entered", "remaining", "comp", "groups"], 6, ALL, 100);
    expect(next).not.toContain("comp"); // never enters the optional list…
    expect(chooseMetrics(ALL, next, 100, 6).shown).toContain("comp"); // …and stays on the bar
  });

  it("never draws a wider bar than the screen has slots", () => {
    expect(chooseMetrics(ALL, ["groups", "vip"], 100, 4).shown).toHaveLength(4);
    expect(chooseMetrics(ALL, ["groups"], 100, 3).shown).toHaveLength(3);
    expect(chooseMetrics(ALL, null, 100, 3).shown).toEqual(["total", "entered", "remaining"]);
  });

  it("shows all four when nothing has been chosen, at every width that fits", () => {
    expect(chooseMetrics(ALL, [], 100, 4).shown).toEqual(CORE_METRICS);
    expect(chooseMetrics(ALL, [], 100, 6).shown).toEqual(CORE_METRICS);
  });

  it("does not give COMP's slot away to the ranking on an untouched bar", () => {
    // Only a real tick buys that slot. Testing "are there any extras" gave it
    // to the fallback ranking, so a portrait bar nobody had touched opened on
    // Attendus with COMP hidden behind the funnel.
    expect(chooseMetrics(ALL, null, 100, 4).shown).toEqual(CORE_METRICS);
  });

  it("gives COMP's slot to a choice when the bar is too narrow for both", () => {
    // Portrait: four slots. Four pinned would fill it and ticking Groupes would
    // do nothing — the "checkbox that does nothing" bug in a new place. The trio
    // is absolute; COMP is the one that yields, and only to something asked for.
    const { shown, hidden } = chooseMetrics(ALL, ["groups"], 100, 4);
    expect(shown).toEqual(["total", "entered", "remaining", "groups"]);
    expect(hidden).toContain("comp");
  });

  it("keeps COMP when the bar is wide enough — landscape, which is the desk", () => {
    expect(chooseMetrics(ALL, ["groups", "vip"], 100, 6).shown)
      .toEqual([...CORE_METRICS, "groups", "vip"]);
  });

  it("never gives away a slot the trio needs", () => {
    // A phone has three. There is nothing to yield: the trio holds.
    expect(chooseMetrics(ALL, ["groups"], 100, 3).shown).toEqual(["total", "entered", "remaining"]);
  });

  it("reports itself as pinned so the sheet can say so", () => {
    expect(isPinned("total")).toBe(true);
    expect(isPinned("comp")).toBe(true);
    expect(isPinned("groups")).toBe(false);
  });
});

describe("the tick shows what is chosen, not what fitted", () => {
  it("ticks a chosen metric even when the bar had no room for it", () => {
    // Five optional picks, one optional slot. The four that did not fit were
    // drawn as empty boxes, and tapping one removed it instead of adding it.
    const chosen = ["groups", "vip", "children", "notincluded"];
    const shown = chooseMetrics(ALL, chosen, 100, 5).shown;
    expect(shown).not.toContain("notincluded"); // genuinely did not fit
    expect(isTicked("notincluded", chosen, shown)).toBe(true); // but is chosen
  });

  it("falls back to what is on screen before anything has been chosen", () => {
    const shown = chooseMetrics(ALL, null, 100, 5).shown;
    expect(isTicked(shown[0], null, shown)).toBe(true);
    const off = ALL.map((m) => m.key).find((k) => !shown.includes(k))!;
    expect(isTicked(off, null, shown)).toBe(false);
  });
});

describe("ticking one thing never ticks another", () => {
  const slots = 6; // four pinned + two optional

  it("adds the metric you tapped", () => {
    const next = toggleMetric([], "groups", ["total", "entered", "remaining", "comp"], slots, ALL, 100);
    expect(next).toContain("groups");
  });

  it("drops the oldest optional when the optional slots are full", () => {
    // vip chosen first, then children. Ticking groups evicts vip.
    const next = toggleMetric(["vip", "children"], "groups", [], slots, ALL, 100);
    expect(next).toEqual(["children", "groups"]);
  });

  it("never evicts a pinned metric to make room", () => {
    const next = toggleMetric(["vip", "children"], "groups", [], slots, ALL, 100);
    for (const k of CORE_METRICS) expect(next).not.toContain(k);
    expect(chooseMetrics(ALL, next, 100, slots).shown).toEqual(
      expect.arrayContaining(CORE_METRICS)
    );
  });

  it("unticks the metric you tapped, and only that one", () => {
    const next = toggleMetric(["vip", "children"], "vip", [], slots, ALL, 100);
    expect(next).toEqual(["children"]);
  });

  it("lets the optional list empty out — the pinned four are still a bar", () => {
    const next = toggleMetric(["vip"], "vip", [], slots, ALL, 100);
    expect(next).toEqual([]);
    expect(chooseMetrics(ALL, next, 100, slots).shown).toEqual(CORE_METRICS);
  });

  it("keeps the live filter on the bar even if it was the oldest tick", () => {
    // A list filtered by a pill you cannot see is four rows and no explanation.
    const next = toggleMetric(["vip", "children"], "groups", slots ? [] : [], slots, ALL, 100, ["vip"]);
    expect(next).toContain("vip");
    expect(next).toContain("groups");
    expect(next).not.toContain("children");
  });
});
