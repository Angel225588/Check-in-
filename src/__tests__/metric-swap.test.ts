import { describe, it, expect } from "vitest";
import { toggleMetric, chooseMetrics } from "@/lib/metric-choice";

/**
 * US-19, second round — ticking a fifth metric on a four-slot bar.
 *
 * It appended to the stored list and `chooseMetrics` sliced the list to the
 * slots, so the tick landed in fifth place and nothing on screen moved. From
 * the desk that is a checkbox that does not work: you tick Comp, the bar does
 * not change, and the only way through is to work out for yourself that
 * something has to come off first.
 *
 * The new one takes the last slot. Not the first free one, not the oldest —
 * the LAST, so the three that answer "where are we" stay put and the slot you
 * are actually choosing is always the same one.
 */
const CANDIDATES = [
  { key: "total", value: 186 },
  { key: "entered", value: 157 },
  { key: "remaining", value: 29 },
  { key: "expected", value: 170 },
  { key: "children", value: 16 },
  { key: "groups", value: 18 },
  { key: "comp", value: 15 },
  { key: "vip", value: 15 },
];

describe("toggleMetric at capacity", () => {
  const full = ["total", "entered", "remaining", "expected"];

  it("swaps the new one into the last slot", () => {
    expect(toggleMetric(full, "comp", full, 4)).toEqual([
      "total", "entered", "remaining", "comp",
    ]);
  });

  it("never grows past the slots it has", () => {
    let list = full;
    for (const k of ["comp", "vip", "groups"]) list = toggleMetric(list, k, list, 4);
    expect(list).toHaveLength(4);
    expect(list[3]).toBe("groups");
  });

  it("leaves the three that answer 'where are we' alone", () => {
    const after = toggleMetric(full, "vip", full, 4);
    expect(after.slice(0, 3)).toEqual(["total", "entered", "remaining"]);
  });

  it("still just adds when there is room", () => {
    expect(toggleMetric(["total", "entered"], "comp", ["total", "entered"], 4))
      .toEqual(["total", "entered", "comp"]);
  });

  it("unticking is unchanged — it removes and leaves a free slot", () => {
    expect(toggleMetric(full, "expected", full, 4)).toEqual(["total", "entered", "remaining"]);
  });

  it("the tick is visible on the bar, which was the whole complaint", () => {
    const after = toggleMetric(full, "comp", full, 4);
    expect(chooseMetrics(CANDIDATES, after, 186, 4).shown).toContain("comp");
  });

  it("without slots it behaves exactly as before", () => {
    expect(toggleMetric(full, "comp", full)).toHaveLength(5);
  });
});
