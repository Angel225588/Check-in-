import { describe, it, expect } from "vitest";
import { portraitSlot, compactMetrics } from "@/lib/portrait";

/**
 * Portrait's one real decision, settled in HTML before it was coded: on 320px
 * the results list and the guest card cannot both have the space, and trying
 * costs the allergy chip its place. So they take turns — Option B.
 *
 * These cases are the turn-taking rule, written down so it cannot drift back
 * into "show a bit of both".
 */
describe("portraitSlot — what the body shows", () => {
  const base = { query: "", filter: null as string | null, hasHit: false, flash: false };

  it("shows the idle carousel before anything is typed", () => {
    expect(portraitSlot(base)).toBe("idle");
  });

  it("shows the list while the query is still ambiguous", () => {
    expect(portraitSlot({ ...base, query: "22" })).toBe("list");
  });

  it("gives the whole slot to the card once a room resolves", () => {
    expect(portraitSlot({ ...base, query: "224", hasHit: true })).toBe("card");
  });

  it("shows the list for a metric filter with no query", () => {
    expect(portraitSlot({ ...base, filter: "remaining" })).toBe("list");
  });

  it("confirms a check-in in the slot the eye is already on", () => {
    expect(portraitSlot({ ...base, flash: true })).toBe("flash");
  });

  it("drops the confirmation the moment the next guest is typed", () => {
    expect(portraitSlot({ ...base, query: "3", flash: true })).toBe("list");
  });

  it("never lets a stale confirmation outrank a resolved room", () => {
    expect(portraitSlot({ ...base, query: "515", hasHit: true, flash: true })).toBe("card");
  });

  it("treats whitespace as nothing typed", () => {
    expect(portraitSlot({ ...base, query: "   " })).toBe("idle");
  });
});

/**
 * The metrics bar in portrait. Seven pills across 320px is 45px each — under
 * the touch minimum and unreadable besides. Four fit. Which four is not a
 * fixed list: the outcome trio always leads, then the day decides, the same
 * rule the report's tile row already follows.
 */
describe("compactMetrics — which four the day deserves", () => {
  it("leads with the outcome trio, in reading order", () => {
    const picked = compactMetrics(
      [
        { key: "vip", value: 15 },
        { key: "remaining", value: 29 },
        { key: "total", value: 207 },
        { key: "entered", value: 178 },
      ],
      100
    );
    expect(picked.slice(0, 3)).toEqual(["total", "entered", "remaining"]);
  });

  it("gives the fourth slot to the biggest thing the day actually contains", () => {
    const picked = compactMetrics(
      [
        { key: "total", value: 207 },
        { key: "entered", value: 178 },
        { key: "remaining", value: 29 },
        { key: "vip", value: 2 },
        { key: "groups", value: 62 },
      ],
      100
    );
    expect(picked[3]).toBe("groups");
  });

  it("never shows a metric the day has none of", () => {
    const picked = compactMetrics(
      [
        { key: "total", value: 207 },
        { key: "entered", value: 178 },
        { key: "remaining", value: 29 },
        { key: "children", value: 0 },
        { key: "comp", value: 0 },
      ],
      100
    );
    expect(picked).toEqual(["total", "entered", "remaining"]);
  });

  it("weights a coach above a lone VIP at the same head count", () => {
    const picked = compactMetrics(
      [
        { key: "total", value: 200 },
        { key: "entered", value: 100 },
        { key: "remaining", value: 100 },
        { key: "vip", value: 8 },
        { key: "groups", value: 8 },
      ],
      100
    );
    expect(picked[3]).toBe("groups");
  });

  it("honours a wider bar when there is room for one", () => {
    const picked = compactMetrics(
      [
        { key: "total", value: 207 },
        { key: "entered", value: 178 },
        { key: "remaining", value: 29 },
        { key: "vip", value: 15 },
        { key: "groups", value: 62 },
        { key: "children", value: 11 },
      ],
      100,
      5
    );
    expect(picked).toHaveLength(5);
    expect(picked[3]).toBe("groups");
  });

  it("survives a day with nothing but the trio", () => {
    expect(compactMetrics([{ key: "total", value: 4 }], 1)).toEqual(["total"]);
  });

  it("does not divide by zero on an empty house", () => {
    const picked = compactMetrics(
      [
        { key: "total", value: 0 },
        { key: "vip", value: 3 },
      ],
      0
    );
    expect(picked).toContain("vip");
  });
});
