/**
 * The month ledger — how the report survives the purge.
 *
 * THE PROBLEM. `sessionHistory` holds full `clients[]` and `checkIns[]`: guest
 * names, room numbers, VIP notes. It is purged at `RETENTION_DAYS` because that
 * is guest data and shorter is strictly better (GDPR-AUDIT §3). But a monthly
 * report wants totals from before that window, and "covers since they started"
 * wants all of them. Raising retention to a year would buy the history at the
 * price of twelve times as much personal data sitting on a reception tablet
 * that gets left on a desk. Measured, the storage is there — a compacted day is
 * about 7 KB against a 4.9 MB localStorage cap — so the constraint was never
 * really space. It is exposure.
 *
 * THE ANSWER. The report needs COUNTS, not people. So each day is rolled up
 * into its month here — covers, off-list covers, VIP attendance, the busiest
 * service, the worst quarter hour — and the guest data is left to be purged on
 * schedule. A month costs a few hundred bytes; ten years of them is kilobytes.
 * Retention stays exactly where the audit wants it, and the totals still go
 * back to day one.
 *
 * TWO RULES THIS FILE MUST NOT BREAK:
 *
 *  1. **No personal data, ever.** Not a name, not a room number. This store has
 *     no purge behind it, so anything personal that reaches it stays forever.
 *     `value-ledger.test.ts` asserts the serialised form contains neither.
 *
 *  2. **Counts, never euros.** Money is derived at render time from the current
 *     assumptions. Store a euro figure and changing the breakfast price leaves
 *     last year frozen at last year's price, which is how a report starts
 *     disagreeing with itself.
 *
 * Recording is idempotent by construction: each month keeps the list of days it
 * has already counted, so rebuilding from whatever is still retained — which
 * happens on every load, and overlaps heavily — can never double a total.
 */

import type { DailyData } from "./types";
import { generateDayReport, type DayReport, type RoomReport } from "./report";
import { buildAffluence, hhmm } from "./report-v2";
import { PEAK_GRAIN_MINUTES } from "./value-report";

export const LEDGER_KEY = "value_ledger";

export interface LedgerPeak {
  date: string;
  start: number;
  time: string;
  covers: number;
}

export interface LedgerBusiest {
  date: string;
  covers: number;
}

export interface MonthAggregate {
  month: string;
  /** Service dates already counted. The idempotence key, and the only reason
   *  re-recording a retained day is safe. */
  days: string[];
  covers: number;
  offListCovers: number;
  vipsTotal: number;
  vipsServed: number;
  busiest: LedgerBusiest | null;
  peak: LedgerPeak | null;
}

export type Ledger = Record<string, MonthAggregate>;

// --- the same entitlement rule the live report uses -----------------------
//
// Deliberately duplicated in shape rather than imported from a shared private:
// if these two ever disagree, a month computed live and the same month read
// back from the ledger would differ, and nobody would know which was right.
// `value-ledger.test.ts` and `value-report.test.ts` pin the same cases.

function isEntitled(room: RoomReport): boolean {
  const source = room.vipSource ?? "breakfast_list";
  return source === "breakfast_list" && room.hasBreakfast;
}

function offListOf(report: DayReport): number {
  let entitled = 0;
  for (const room of report.rooms) {
    if (!isEntitled(room)) continue;
    entitled += Math.min(room.entered, room.totalGuests);
  }
  return report.totalEntered - entitled;
}

// --- storage --------------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * A stored month we are willing to trust.
 *
 * One malformed month must not cost the other hundred nineteen — a ledger that
 * throws away a decade because something wrote a string into July is worse than
 * one that drops July.
 */
function validMonth(v: unknown): v is MonthAggregate {
  if (!v || typeof v !== "object") return false;
  const m = v as MonthAggregate;
  return (
    typeof m.month === "string" &&
    Array.isArray(m.days) &&
    isFiniteNumber(m.covers) &&
    isFiniteNumber(m.offListCovers) &&
    isFiniteNumber(m.vipsTotal) &&
    isFiniteNumber(m.vipsServed)
  );
}

export function readLedger(): Ledger {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Ledger = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (validMonth(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* quota — the live months still compute from retained data */
  }
}

function emptyMonth(month: string): MonthAggregate {
  return {
    month,
    days: [],
    covers: 0,
    offListCovers: 0,
    vipsTotal: 0,
    vipsServed: 0,
    busiest: null,
    peak: null,
  };
}

// --- recording ------------------------------------------------------------

/**
 * Fold every day into its month, skipping any already counted.
 *
 * Call it whenever the app has data in hand — on load, after a day closes. A
 * service can only be missed if the app is never opened during the whole
 * retention window after it, which is a tablet nobody is using.
 */
export function recordDays(days: DailyData[]): void {
  const ledger = readLedger();
  let changed = false;

  for (const d of days) {
    if (!d?.date) continue;
    // No roster means the app was not used that morning. Counting it would
    // add a day of zero to `daysActive` and drag every per-day figure down.
    if ((d.clients?.length ?? 0) === 0) continue;

    const month = d.date.slice(0, 7);
    const agg = ledger[month] ?? emptyMonth(month);
    if (agg.days.includes(d.date)) continue;

    const report = generateDayReport(d.clients, d.checkIns, d.date);

    agg.days.push(d.date);
    agg.covers += report.totalEntered;
    agg.offListCovers += offListOf(report);

    for (const room of report.rooms) {
      if (!room.isVip) continue;
      agg.vipsTotal += 1;
      if (room.entered > 0) agg.vipsServed += 1;
    }

    if (report.totalEntered > 0 && report.totalEntered > (agg.busiest?.covers ?? 0)) {
      agg.busiest = { date: d.date, covers: report.totalEntered };
    }

    const affluence = buildAffluence(d.checkIns, PEAK_GRAIN_MINUTES);
    if (affluence.peakIndex >= 0 && affluence.peakCount > (agg.peak?.covers ?? 0)) {
      const start = affluence.buckets[affluence.peakIndex].start;
      agg.peak = { date: d.date, start, time: hhmm(start), covers: affluence.peakCount };
    }

    ledger[month] = agg;
    changed = true;
  }

  if (changed) writeLedger(ledger);
}

// --- reading --------------------------------------------------------------

export function ledgerMonth(month: string): MonthAggregate | null {
  return readLedger()[month] ?? null;
}

export interface LedgerTotals {
  covers: number;
  offListCovers: number;
  vipsTotal: number;
  vipsServed: number;
  daysActive: number;
  months: number;
  /** Oldest month on record, or null on a device that has never served. */
  firstMonth: string | null;
}

/** Everything the device has ever recorded — the "since they started" figure. */
export function ledgerTotals(): LedgerTotals {
  const ledger = readLedger();
  const months = Object.values(ledger);

  const totals: LedgerTotals = {
    covers: 0,
    offListCovers: 0,
    vipsTotal: 0,
    vipsServed: 0,
    daysActive: 0,
    months: months.length,
    firstMonth: null,
  };

  for (const m of months) {
    totals.covers += m.covers;
    totals.offListCovers += m.offListCovers;
    totals.vipsTotal += m.vipsTotal;
    totals.vipsServed += m.vipsServed;
    totals.daysActive += m.days.length;
    if (totals.firstMonth === null || m.month < totals.firstMonth) totals.firstMonth = m.month;
  }

  return totals;
}

/** Months the ledger knows about, newest first. */
export function ledgerMonths(): string[] {
  return Object.keys(readLedger()).sort((a, b) => b.localeCompare(a));
}
