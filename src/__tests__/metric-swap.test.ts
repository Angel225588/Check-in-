import { describe, it, expect } from "vitest";
import { toggleMetric, chooseMetrics } from "@/lib/metric-choice";
import { weakestMetric } from "@/lib/portrait";

/**
 * US-19/US-32 — ticking a metric on a full bar.
 *
 * Round one: it appended, and `chooseMetrics` sliced to the slots, so the tick
 * landed in fifth place and nothing on screen moved.
 *
 * Round two, from the desk: "if I click one, it should take the place of the
 * last one on the ranking." Recency was the wrong rule — from reception's side
 * "the one I ticked most recently" is arbitrary. The one that should go is the
 * one saying least about this morning, and the app already has that score: it
 * is what decides which extras earn a slot when nobody has chosen at all.
 *
 * A coach of 40 outranks 3 comps, whatever order they were ticked in.
 */
const CANDIDATES = [
  { key: "total", value: 186 },
  { key: "entered", value: 157 },
  { key: "remaining", value: 29 },
  { key: "expected", value: 170 },
  { key: "children", value: 16 },
  { key: "groups", value: 40 },
  { key: "comp", value: 3 },
  { key: "vip", value: 15 },
];

describe("weakestMetric", () => {
  it("names the extra that says least about the morning", () => {
    // comp 3/186 × 1 loses to groups 40/186 × 3 — a coach IS the morning.
    expect(weakestMetric(["total", "entered", "groups", "comp"], CANDIDATES, 186)).toBe("comp");
  });

  it("never offers the trio that answers 'where are we'", () => {
    expect(weakestMetric(["total", "entered", "remaining"], CANDIDATES, 186)).toBeNull();
  });

  it("never offers something the caller is holding on to", () => {
    // The live filter, for instance: a list filtered by an invisible pill is
    // four rows and no explanation.
    expect(weakestMetric(["total", "groups", "comp"], CANDIDATES, 186, ["comp"])).toBe("groups");
  });
});

describe("toggleMetric at capacity", () => {
  const full = ["total", "entered", "remaining", "comp"];

  it("displaces the weakest, not the newest", () => {
    expect(toggleMetric(full, "groups", full, 4, CANDIDATES, 186))
      .toEqual(["total", "entered", "remaining", "groups"]);
  });

  it("leaves the trio alone", () => {
    const after = toggleMetric(full, "vip", full, 4, CANDIDATES, 186);
    expect(after.slice(0, 3)).toEqual(["total", "entered", "remaining"]);
    expect(after).toContain("vip");
  });

  it("never grows past the slots it has", () => {
    let list = full;
    for (const k of ["groups", "vip", "children"]) {
      list = toggleMetric(list, k, list, 4, CANDIDATES, 186);
    }
    expect(list).toHaveLength(4);
  });

  it("keeps what the caller pins", () => {
    // Ticking Comp while Groupes is the live filter must not throw Groupes off.
    const after = toggleMetric(
      ["total", "entered", "expected", "groups"], "comp",
      ["total", "entered", "expected", "groups"], 4, CANDIDATES, 186, ["groups"]
    );
    expect(after).toContain("groups");
    expect(after).toContain("comp");
    expect(after).not.toContain("expected");
  });

  it("the tick is visible on the bar, which was the whole complaint", () => {
    const after = toggleMetric(full, "groups", full, 4, CANDIDATES, 186);
    expect(chooseMetrics(CANDIDATES, after, 186, 4).shown).toContain("groups");
  });

  it("still just adds when there is room", () => {
    expect(toggleMetric(["total", "entered"], "comp", ["total", "entered"], 4, CANDIDATES, 186))
      .toEqual(["total", "entered", "comp"]);
  });

  it("unticking removes and frees a slot", () => {
    expect(toggleMetric(full, "comp", full, 4, CANDIDATES, 186))
      .toEqual(["total", "entered", "remaining"]);
  });

  it("without a ranking it falls back to the last slot rather than doing nothing", () => {
    expect(toggleMetric(full, "groups", full, 4))
      .toEqual(["total", "entered", "remaining", "groups"]);
  });
});
