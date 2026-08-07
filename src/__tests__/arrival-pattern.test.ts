import { describe, it, expect } from "vitest";
import { arrivalPattern, MIN_MORNINGS } from "@/lib/arrival-pattern";

/**
 * "Descend d'habitude vers 07:40."
 *
 * This is the MEASURED tier, not Fact: it comes from our own history, so it
 * carries how many mornings it is built on and it refuses to speak with too
 * few. A confident time with two observations behind it is the kind of number
 * someone staffs to, and being wrong about it is worse than saying nothing.
 *
 * The median, not the mean — one guest who overslept to 10:15 once should not
 * drag their 07:30 habit half an hour later. And the middle half rather than
 * min-to-max, because a single outlier defines min and max but says nothing
 * about the habit.
 */
const at = (h: number, m = 0) => h * 60 + m;

describe("arrivalPattern", () => {
  it("says nothing with too little to go on", () => {
    expect(arrivalPattern([])).toBeNull();
    expect(arrivalPattern([at(7, 30)])).toBeNull();
    expect(arrivalPattern([at(7, 30), at(7, 35)])).toBeNull();
    expect(MIN_MORNINGS).toBe(3);
  });

  it("speaks once there are three mornings", () => {
    const p = arrivalPattern([at(7, 30), at(7, 40), at(7, 35)]);
    expect(p).not.toBeNull();
    expect(p!.days).toBe(3);
    expect(p!.typical).toBe(at(7, 35));
  });

  it("takes the median, so one late morning does not move the habit", () => {
    const p = arrivalPattern([at(7, 30), at(7, 35), at(7, 40), at(7, 30), at(10, 15)])!;
    expect(p.typical).toBe(at(7, 35));
  });

  it("reports the middle half, not the extremes", () => {
    // 07:00 07:30 07:35 07:40 09:30 — the 09:30 is real but not the habit.
    const p = arrivalPattern([at(7, 0), at(7, 30), at(7, 35), at(7, 40), at(9, 30)])!;
    expect(p.band[0]).toBeGreaterThanOrEqual(at(7, 0));
    expect(p.band[1]).toBeLessThan(at(9, 30));
  });

  it("averages the two middles on an even count", () => {
    const p = arrivalPattern([at(7, 30), at(7, 40), at(7, 50), at(8, 0)])!;
    expect(p.typical).toBe(at(7, 45));
  });

  it("flags a guest with no habit at all rather than inventing one", () => {
    // 06:40, 08:00, 09:40 — three mornings, no pattern. The band is wide and
    // the caller can say "varie" instead of naming a time.
    const p = arrivalPattern([at(6, 40), at(8, 0), at(9, 40)])!;
    expect(p.spread).toBeGreaterThan(60);
    expect(p.steady).toBe(false);
  });

  it("calls a tight cluster steady", () => {
    const p = arrivalPattern([at(7, 30), at(7, 35), at(7, 40), at(7, 32)])!;
    expect(p.steady).toBe(true);
    expect(p.spread).toBeLessThanOrEqual(30);
  });

  it("ignores impossible times rather than averaging them in", () => {
    const p = arrivalPattern([at(7, 30), at(7, 35), at(7, 40), -5, 99999])!;
    expect(p.days).toBe(3);
  });
});
