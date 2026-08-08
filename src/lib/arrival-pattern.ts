/**
 * When does this guest usually come down?
 *
 * MEASURED, not fact. It is built from our own history, so it carries how many
 * mornings are behind it and it refuses to speak with too few — a confident
 * time with two observations is the kind of number someone acts on, and being
 * wrong about it is worse than saying nothing at all.
 *
 * Two choices that make it honest rather than merely arithmetic:
 *
 * The MEDIAN, not the mean. One guest who overslept to 10:15 once should not
 * drag their 07:30 habit half an hour later.
 *
 * The MIDDLE HALF, not min-to-max. A single outlier defines min and max and
 * says nothing about the habit; the band between the quartiles is the window
 * this guest actually keeps.
 */

/** Below this it is a coincidence, not a habit. Same threshold as the payment
 *  habit on the guest screen, for the same reason. */
export const MIN_MORNINGS = 3;

/** Wider than this and there is no usual time — say "varie" rather than pick
 *  a minute out of a two-hour spread and present it as a habit. */
const STEADY_WITHIN = 30;

export interface ArrivalPattern {
  /** Minutes since midnight. */
  typical: number;
  /** The middle half: [p25, p75], also minutes since midnight. */
  band: [number, number];
  /** Width of that band, in minutes. */
  spread: number;
  /** True when the band is tight enough for "vers 07:35" to be a real claim. */
  steady: boolean;
  /** Mornings it is built on. Always shown — a measured number without its
   *  basis is a guess wearing a uniform. */
  days: number;
}

const quantile = (sorted: number[], q: number): number => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function arrivalPattern(minutes: number[], min: number = MIN_MORNINGS): ArrivalPattern | null {
  // A timestamp that did not parse, or a clock that was wrong, is not an
  // observation. Dropping them is better than averaging them in.
  const clean = minutes.filter((m) => Number.isFinite(m) && m >= 0 && m < 24 * 60).sort((a, b) => a - b);
  if (clean.length < min) return null;

  const typical = Math.round(quantile(clean, 0.5));
  const band: [number, number] = [Math.round(quantile(clean, 0.25)), Math.round(quantile(clean, 0.75))];
  const spread = band[1] - band[0];

  return { typical, band, spread, steady: spread <= STEADY_WITHIN, days: clean.length };
}

/** "07:35" from minutes since midnight. */
export function hhmmOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
