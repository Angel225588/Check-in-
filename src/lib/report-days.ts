/**
 * The days the report can show.
 *
 * One report per service. The manager reading it at 15:00 wants yesterday as
 * often as today, and making them leave for a separate history screen to get
 * there is a trip that teaches nothing.
 *
 * A range (a week, a month) is deliberately NOT here. Averaging services into
 * one view is a different object with a different audience — see US-20, now
 * scoped to the dashboard. Stacking seven mornings into one chart would look
 * impressive and say nothing.
 */

/** Newest first, today included only when there is a service to show. */
export function reportDays(
  historyDates: string[],
  todayIso: string,
  hasOpenSession: boolean
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Closing the day writes today into history, so today can arrive from both
  // sides; it must not then appear twice in the picker.
  if (hasOpenSession) { out.push(todayIso); seen.add(todayIso); }
  for (const d of [...historyDates].sort((a, b) => b.localeCompare(a))) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

/**
 * The next day in `dir` (-1 older, +1 newer), or null at the ends.
 *
 * The ends are real ends. Wrapping from the oldest day round to today reads as
 * a jump backwards in time to whoever is holding the tablet.
 */
export function stepDay(days: string[], current: string, dir: -1 | 1): string | null {
  const i = days.indexOf(current);
  if (i < 0) return null;
  // days is newest-first, so "older" is a higher index.
  const next = i - dir;
  return next >= 0 && next < days.length ? days[next] : null;
}
