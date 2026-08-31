/**
 * "Last month's report is ready."
 *
 * The rule is deliberately narrow: a month is reportable only once it is over.
 * Offering August on 12 August produces a half-month wearing a month's name,
 * and the first person to compare two of them finds a figure that went down
 * because the month was shorter, not because the hotel did worse.
 *
 * The badge is a nudge, never a gate — every month with data stays reachable
 * from the report's own picker whether or not it was ever announced here.
 */

import type { DailyData } from "./types";

const SEEN_KEY = "value_report_seen";

/** "2026-08-04" → "2026-08" */
function monthKey(dateIso: string): string {
  return (dateIso || "").slice(0, 7);
}

/**
 * Months in which a service actually ran, newest first.
 *
 * A day with an empty roster is a day the app was not used, not a quiet
 * morning — including it would announce a report with nothing on it.
 */
export function monthsWithData(days: DailyData[]): string[] {
  const months = new Set<string>();
  for (const d of days) {
    if (!d?.date) continue;
    if ((d.clients?.length ?? 0) === 0) continue;
    months.add(monthKey(d.date));
  }
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

/** The month before the one `dateIso` falls in. */
export function previousMonth(dateIso: string): string {
  const [y, m] = monthKey(dateIso).split("-").map(Number);
  // Month 0 of the same year is December of the year before, so January needs
  // no special case.
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function seenMonths(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}

export function markMonthSeen(month: string): void {
  if (typeof localStorage === "undefined") return;
  const seen = seenMonths();
  if (seen.includes(month)) return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, month]));
  } catch {
    /* quota — the badge stays lit, which is the harmless direction */
  }
}

export interface ValueNotice {
  month: string;
  unread: boolean;
}

/**
 * The report worth pointing at right now, or null.
 *
 * Only ever last month, and only if something was served in it. `unread` drives
 * the dot; the card itself stays so the report remains one tap from home after
 * it has been read.
 */
export function pendingNotice(days: DailyData[], todayIso: string): ValueNotice | null {
  const target = previousMonth(todayIso);
  if (!monthsWithData(days).includes(target)) return null;
  return { month: target, unread: !seenMonths().includes(target) };
}
