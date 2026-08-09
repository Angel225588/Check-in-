import { describe, it, expect } from "vitest";
import { toggleMetric, chooseMetrics, CORE_METRICS } from "@/lib/metric-choice";
import { weakestMetric } from "@/lib/portrait";

/**
 * US-19/US-32 — ticking a metric on a full bar. Three rounds, each one a
 * correction of the last, and the third came from the desk during a service.
 *
 * Round one: it appended, and `chooseMetrics` sliced to the slots, so the tick
 * landed in fifth place and nothing on screen moved.
 *
 * Round two: displace the metric saying least about this morning, using the
 * ranking the app already had. Defensible, and invisible.
 *
 * Round three, reported live: "I selected group and it was selecting vip or
 * children and not group." Ticking Groupes made VIP's tick disappear, because
 * VIP scored lowest — and from behind the counter that reads as the checkbox
 * choosing for you. The rule is now the one thing reception can predict without
 * being taught it: the optional metric chosen LONGEST AGO makes way.
 *
 * The ranking is still what fills the bar when nobody has chosen anything, and
 * `weakestMetric` still answers that question. It just no longer decides what
 * happens under someone's finger.
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
    expect(weakestMetric(["total", "groups", "comp"], CANDIDATES, 186, ["comp"])).toBe("groups");
  });
});

/* Six slots: four pinned, two to play with. */
const SLOTS = 6;

describe("toggleMetric at capacity", () => {
  it("displaces the one chosen longest ago, not the one scoring lowest", () => {
    // vip was ticked first, so vip leaves — whatever the ranking thinks.
    expect(toggleMetric(["vip", "children"], "groups", [], SLOTS, CANDIDATES, 186))
      .toEqual(["children", "groups"]);
  });

  it("leaves the pinned four alone", () => {
    const after = toggleMetric(["vip", "children"], "groups", [], SLOTS, CANDIDATES, 186);
    for (const k of CORE_METRICS) expect(after, k).not.toContain(k);
    expect(chooseMetrics(CANDIDATES, after, 186, SLOTS).shown.slice(0, 4)).toEqual(CORE_METRICS);
  });

  it("never grows past the slots it has", () => {
    let list: string[] = [];
    for (const k of ["groups", "vip", "children", "expected"]) {
      list = toggleMetric(list, k, list, SLOTS, CANDIDATES, 186);
    }
    expect(chooseMetrics(CANDIDATES, list, 186, SLOTS).shown).toHaveLength(SLOTS);
  });

  it("keeps what the caller pins", () => {
    // Ticking Comp-like extras while Groupes is the live filter must not throw
    // Groupes off, even though Groupes is the oldest tick.
    const after = toggleMetric(["groups", "expected"], "vip", [], SLOTS, CANDIDATES, 186, ["groups"]);
    expect(after).toContain("groups");
    expect(after).toContain("vip");
    expect(after).not.toContain("expected");
  });

  it("the tick is visible on the bar, which was the whole complaint", () => {
    const after = toggleMetric(["vip", "children"], "groups", [], SLOTS, CANDIDATES, 186);
    expect(chooseMetrics(CANDIDATES, after, 186, SLOTS).shown).toContain("groups");
  });

  it("still just adds when there is room", () => {
    expect(toggleMetric(["vip"], "groups", [], SLOTS, CANDIDATES, 186)).toEqual(["vip", "groups"]);
  });

  it("unticking removes and frees a slot", () => {
    expect(toggleMetric(["vip", "groups"], "vip", [], SLOTS, CANDIDATES, 186)).toEqual(["groups"]);
  });

  it("evicts predictably even with no candidate list to rank", () => {
    expect(toggleMetric(["vip", "children"], "groups", [], SLOTS)).toEqual(["children", "groups"]);
  });
});
