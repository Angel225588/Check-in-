import { describe, it, expect } from "vitest";
import { rankTiles, type RankInput } from "@/lib/tile-rank";

const base: RankInput = {
  rooms: 100,
  tiles: [
    { key: "in", value: 70 },
    { key: "no", value: 20 },
    { key: "partial", value: 10 },
    { key: "vip", value: 0 },
    { key: "comp", value: 0 },
    { key: "enfants", value: 0 },
    { key: "groupe", value: 0 },
    { key: "ecart", value: 0 },
  ],
};

const keys = (r: RankInput) => rankTiles(r).map((t) => t.key);

describe("which metrics earn a slot", () => {
  // The outcome of the service is the report. These three are the report.
  it("always leads with the outcome trio, in that order", () => {
    expect(keys(base).slice(0, 3)).toEqual(["in", "no", "partial"]);
  });

  it("puts a day full of children ahead of an empty COMP tile", () => {
    const r = { ...base, tiles: base.tiles.map((t) => t.key === "enfants" ? { ...t, value: 34 } : t) };
    expect(keys(r).indexOf("enfants")).toBeLessThan(keys(r).indexOf("comp"));
  });

  it("puts groups forward when there are groups", () => {
    const r = { ...base, tiles: base.tiles.map((t) => t.key === "groupe" ? { ...t, value: 40 } : t) };
    expect(keys(r).slice(0, 4)).toContain("groupe");
  });

  // A metric reading zero teaches nothing and costs a slot someone else needs.
  it("sinks every zero below everything with a value", () => {
    const r = {
      ...base,
      tiles: base.tiles.map((t) => t.key === "ecart" ? { ...t, value: 6 } : t),
    };
    const k = keys(r);
    const firstZero = k.findIndex((key) => (r.tiles.find((t) => t.key === key)?.value ?? 0) === 0);
    const lastNonZero = k.reduce((acc, key, i) =>
      (r.tiles.find((t) => t.key === key)?.value ?? 0) > 0 ? i : acc, -1);
    expect(lastNonZero).toBeLessThan(firstZero);
  });

  // Errors in the source data are not a big number and never will be. They
  // matter out of proportion to their size, so they are scored that way.
  it("surfaces écarts even though the count is small", () => {
    const r = { ...base, tiles: base.tiles.map((t) => t.key === "ecart" ? { ...t, value: 3 } : t) };
    expect(keys(r).slice(0, 5)).toContain("ecart");
  });

  it("keeps a tiny incidental count out of the first five", () => {
    const r = { ...base, tiles: base.tiles.map((t) => t.key === "comp" ? { ...t, value: 1 } : t) };
    expect(keys(r).slice(0, 3)).toEqual(["in", "no", "partial"]);
  });

  it("returns every tile — ranking decides order, never membership", () => {
    expect(rankTiles(base)).toHaveLength(base.tiles.length);
  });

  it("survives a day with no rooms without dividing by zero", () => {
    expect(() => rankTiles({ rooms: 0, tiles: base.tiles })).not.toThrow();
    expect(keys({ rooms: 0, tiles: base.tiles })).toHaveLength(base.tiles.length);
  });
});
