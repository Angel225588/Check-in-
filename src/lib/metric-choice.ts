import { compactMetrics, weakestMetric, type MetricCandidate } from "@/lib/portrait";

/**
 * US-19 — which metrics are on the bar.
 *
 * The funnel started life as a second filter, which meant two controls doing
 * one job: you could filter from the pill or from the sheet, and the sheet's
 * list was the leftovers. It is a checklist now — what is ON the bar and what
 * is not — because the bar is four slots wide and which four depends on the
 * day and on who is at the desk. Filtering stays on the pill, where a number
 * and the act of acting on it are the same gesture.
 *
 * Two invariants. The bar is never empty: with no choice stored, or a choice
 * the day cannot honour, it falls back to the ranking. And a chosen metric the
 * day has none of never takes a slot — a zero occupies a place to say nothing.
 */
export const CORE_METRICS = ["total", "entered", "remaining"];

export interface MetricChoice {
  /** In display order, already trimmed to the slots available. */
  shown: string[];
  /** Present in the day, not on the bar. What the funnel counts. */
  hidden: string[];
}

export function chooseMetrics(
  all: MetricCandidate[],
  chosen: string[] | null | undefined,
  rooms: number,
  slots: number
): MetricChoice {
  const present = new Set(all.filter((m) => m.value > 0).map((m) => m.key));
  // The trio is the answer to "where are we" and is always worth a slot, even
  // at zero — an empty Entrés early in the service is information.
  for (const k of CORE_METRICS) if (all.some((m) => m.key === k)) present.add(k);

  const picked = (chosen ?? []).filter((k) => present.has(k));
  const shown = (picked.length > 0 ? picked : compactMetrics(all, rooms, slots)).slice(0, slots);
  const hidden = all
    .filter((m) => present.has(m.key) && !shown.includes(m.key))
    .map((m) => m.key);

  return { shown, hidden };
}

/**
 * Tick or untick one.
 *
 * With nothing stored yet, the first tap edits what is on screen rather than
 * starting a list of one — otherwise ticking "VIP" would blank the other three
 * and the control would look broken the first time anyone touched it.
 *
 * The last one cannot be removed. An empty bar is not a preference.
 *
 * **On a full bar, the new one displaces the weakest.** It used to append, and
 * `chooseMetrics` slices to the slots — so the fifth tick landed in fifth place
 * and nothing on screen moved: a checkbox that does not work.
 *
 * Which one leaves is a ranking question, not a recency one. "The last one I
 * ticked" is arbitrary from the desk; the one that should go is the one saying
 * least about this morning — and that score already exists, because it is what
 * decides which extras earn a slot when nobody has chosen at all. A coach of 40
 * outranks 3 comps whatever order they were ticked in.
 *
 * `keep` is for anything that must not be displaced whatever it scores — the
 * live filter above all: a list filtered by a pill you cannot see is four rows
 * and no explanation.
 */
export function toggleMetric(
  chosen: string[] | null | undefined,
  key: string,
  visibleNow: string[],
  slots?: number,
  all?: MetricCandidate[],
  rooms?: number,
  keep: string[] = []
): string[] {
  const base = chosen && chosen.length > 0 ? [...chosen] : [...visibleNow];
  const at = base.indexOf(key);
  if (at >= 0) {
    if (base.length === 1) return base;
    base.splice(at, 1);
    return base;
  }
  if (slots && base.length >= slots) {
    const weakest = all ? weakestMetric(base, all, rooms ?? 0, [...keep, key]) : null;
    // No ranking to go on — the last slot still beats a tick that does nothing.
    const drop = weakest ?? base[base.length - 1];
    return [...base.filter((k) => k !== drop), key];
  }
  return [...base, key];
}
