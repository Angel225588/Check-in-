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
 *
 * FOUR ARE PINNED. Total, Entrés and Restants answer "where are we"; COMP is
 * the one reception is asked to account for and cannot reconstruct from the
 * others. They hold their slots at zero — an empty Entrés at 06:40 and a day
 * with no comps are both information — and nothing displaces them. The
 * checklist decides the REST, which is the only part of the bar that is a
 * preference.
 */
export const CORE_METRICS = ["total", "entered", "remaining", "comp"];

/** Pinned metrics are on the bar always; the checklist cannot remove them. */
export function isPinned(key: string): boolean {
  return CORE_METRICS.includes(key);
}

/**
 * Is this box ticked?
 *
 * Drawn from the CHOICE, never from what fitted. The sheet used to read the
 * truncated bar, so a chosen metric with no slot rendered as an empty box —
 * and tapping it removed it, which looked like a checkbox that did nothing.
 */
export function isTicked(key: string, chosen: string[] | null | undefined, visibleNow: string[]): boolean {
  if (isPinned(key)) return true;
  return (chosen && chosen.length > 0 ? chosen : visibleNow).includes(key);
}

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
  // The pinned four are always worth a slot, even at zero — an empty Entrés
  // early in the service, and a morning with no comps, are both information.
  for (const k of CORE_METRICS) if (all.some((m) => m.key === k)) present.add(k);

  // Pinned first, in their own fixed order, so the left of the bar never moves
  // under the eye. Whatever the checklist says fills what is left.
  const pinned = CORE_METRICS.filter((k) => all.some((m) => m.key === k));

  /* null means nobody has ever chosen — fall back to the ranking. An empty
     ARRAY means someone unticked everything, which is a choice and is honoured:
     the pinned four are a bar. Conflating the two put metrics back on the bar
     that had just been removed by hand. */
  const extras =
    chosen == null
      ? compactMetrics(all, rooms, slots).filter((k) => !isPinned(k))
      : chosen.filter((k) => present.has(k) && !isPinned(k));

  /* A checklist that cannot change the bar is the bug we just fixed, wearing a
     different hat. Landscape has six slots, so four pinned still leave two to
     choose. Portrait has four and a phone three — four pinned would fill it, and
     ticking Groupes would do nothing at all.

     So the TRIO is absolute and COMP yields its slot, and only its slot, to
     something explicitly chosen. Nobody chooses anything: the bar is the pinned
     four. Somebody chooses Groupes on a portrait tablet: they get the trio and
     Groupes, and COMP is one tap away behind the funnel — which is what asking
     for Groupes meant. */
  const TRIO = 3;
  /* Only a real tick buys COMP's slot. The ranking fallback always produces
     extras, so testing `extras.length` gave that slot away on a bar nobody had
     touched — portrait opened on "Attendus" with COMP behind the funnel. */
  const chose = chosen != null && chosen.length > 0;
  const reserve = chose ? 1 : 0;
  const pinnedShown = pinned.slice(0, Math.max(TRIO, slots - reserve));
  const room = Math.max(0, slots - pinnedShown.length);

  const shown = [...pinnedShown, ...extras.slice(0, room)].slice(0, slots);
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
 * The list it edits is the OPTIONAL one. The pinned four are not a preference,
 * so tapping one changes nothing and the sheet draws them as fixed rather than
 * as boxes that quietly refuse.
 *
 * **On a full bar, the new one displaces the one chosen longest ago.** It used
 * to displace "the least parlante" by ranking, which is a defensible rule and
 * an invisible one: from the desk, ticking Groupes made VIP's tick disappear,
 * and what reception reported was "I selected group and it selected VIP".
 *
 * Recency is predictable without being explained. You ticked four things, the
 * bar holds two, so the two you asked for most recently are the two you get.
 *
 * `keep` is for anything that must not be displaced whatever its age — the live
 * filter above all: a list filtered by a pill you cannot see is four rows and
 * no explanation.
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
  // Pinned metrics are not on the checklist's books at all.
  if (isPinned(key)) return [...(chosen ?? [])].filter((k) => !isPinned(k));

  const base = (chosen && chosen.length > 0 ? [...chosen] : [...visibleNow]).filter(
    (k) => !isPinned(k)
  );

  const at = base.indexOf(key);
  if (at >= 0) {
    // The optional list may empty completely: the pinned four are still a bar.
    base.splice(at, 1);
    return base;
  }

  const pinnedCount = all ? CORE_METRICS.filter((k) => all.some((m) => m.key === k)).length : CORE_METRICS.length;
  const room = slots ? Math.max(1, slots - pinnedCount) : 0;
  if (room && base.length >= room) {
    // Oldest first, but never something that must stay — the live filter.
    const drop = base.find((k) => !keep.includes(k)) ?? base[0];
    return [...base.filter((k) => k !== drop), key];
  }
  return [...base, key];
}
