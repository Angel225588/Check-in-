import { describe, it, expect } from "vitest";
import { capRows, ROW_CAP } from "@/lib/row-cap";

/**
 * One digit into a 210-room house matches about half of it. Rendering all of
 * them cost 106ms on a desktop — several times that on the iPad — on the one
 * keystroke that has to feel instant, to produce a list nobody can use.
 *
 * The cap is never silent: whatever is not drawn is counted, because a list
 * that quietly stops is a list that lies about what the day contains.
 */
describe("capRows", () => {
  const rooms = (n: number) => Array.from({ length: n }, (_, i) => String(100 + i));

  it("shows everything when everything fits", () => {
    const { shown, more } = capRows(rooms(12));
    expect(shown).toHaveLength(12);
    expect(more).toBe(0);
  });

  it("stops at the cap and counts the rest", () => {
    const { shown, more } = capRows(rooms(110));
    expect(shown).toHaveLength(ROW_CAP);
    expect(more).toBe(110 - ROW_CAP);
  });

  it("keeps the order it was given — the first match is the likeliest", () => {
    const { shown } = capRows(rooms(110));
    expect(shown[0]).toBe("100");
    expect(shown[1]).toBe("101");
  });

  it("never reports more than nothing on an exact fit", () => {
    const { shown, more } = capRows(rooms(ROW_CAP));
    expect(shown).toHaveLength(ROW_CAP);
    expect(more).toBe(0);
  });

  it("survives an empty list", () => {
    expect(capRows([])).toEqual({ shown: [], more: 0 });
  });

  it("honours a caller that wants a shorter list", () => {
    const { shown, more } = capRows(rooms(50), 10);
    expect(shown).toHaveLength(10);
    expect(more).toBe(40);
  });
});
