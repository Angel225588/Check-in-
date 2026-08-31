/**
 * What the software was worth to this hotel last month.
 *
 * The arithmetic only. No rendering, no storage, no clock of its own — hand it
 * days and assumptions and it hands back figures, so the same numbers appear on
 * the screen, in a PDF and in a test.
 *
 * THE RULE THIS FILE IS BUILT AROUND: every figure is either measured from
 * something reception actually recorded, or it is a number the hotel typed in
 * and can see printed beside the result. There is no third category. Where a
 * figure needs an input nobody has supplied, it comes back `null` and the view
 * says so — an invented euro is worse than a blank, because a director who
 * catches one invented number stops believing the measured ones too.
 *
 * WHAT IS DELIBERATELY ABSENT: a total since the hotel started. `sessionHistory`
 * is a 30-day ring buffer (`RETENTION_DAYS`), so the months before it are not
 * hidden — they are deleted. `retentionLimited` says when the window bit into
 * the month being reported, which makes the total a floor rather than a total.
 */

import type { DailyData } from "./types";
import { generateDayReport, type DayReport, type RoomReport } from "./report";
import { buildAffluence, hhmm, formuleOf, FORMULE_LABEL, type Formule } from "./report-v2";

/** Twenty seconds per cover: the brief's default, and the only one it gave. */
export const DEFAULT_SECONDS_PER_COVER = 20;

/** The window the "peak throughput" figure is measured over. */
export const PEAK_GRAIN_MINUTES = 15;

export interface ValueAssumptions {
  /** Desk time one cover used to take. Multiplied by covers to get hours. */
  secondsPerCover: number;
  /**
   * Loaded hourly cost of the person at the desk.
   *
   * `null` on purpose until someone sets it. There is no defensible default —
   * it varies by contract, country and year — so the report shows the hours
   * (measured) and withholds the euros (not ours to guess).
   */
  hourlyRate: number | null;
  /** What one breakfast is worth. Seeded from the hotel's existing
   *  `costPerCover` setting, which they already maintain. */
  breakfastPrice: number;
  /** What the hotel pays us per month. Stored nowhere else in the app, so it
   *  is `null` until entered, and the comparison line stays hidden. */
  monthlyFee: number | null;
}

export interface OffListLine {
  /** A `Formule`, or `extras` for people beyond a room's booked party size. */
  key: Formule | "extras";
  label: string;
  covers: number;
}

export interface PeakQuarter {
  date: string;
  /** Minutes since midnight at the left edge of the busiest quarter hour. */
  start: number;
  time: string;
  covers: number;
}

export interface BusiestService {
  date: string;
  covers: number;
}

export interface ValueReport {
  /** "2026-08" */
  month: string;
  hasData: boolean;
  daysActive: number;
  firstDay: string;
  lastDay: string;

  /** People served this month. */
  covers: number;

  /** Covers served that no reservation entitled to breakfast. The headline. */
  offListCovers: number;
  offListValue: number;
  offListBreakdown: OffListLine[];

  hoursSaved: number;
  /** `null` until an hourly rate is set. */
  staffValue: number | null;

  busiestService: BusiestService | null;
  peakQuarter: PeakQuarter | null;

  vipsTotal: number;
  vipsServed: number;
  vipsMissed: number;

  /** `null` whenever any component of it is. */
  totalValue: number | null;
  monthlyFee: number | null;

  /** True when retention deletes part of the month being reported, which makes
   *  every total on the page a floor. */
  retentionLimited: boolean;
  /** The oldest day this device can still be holding. */
  retainedFrom: string;

  assumptions: ValueAssumptions;
}

export interface ValueReportContext {
  retentionDays?: number;
  todayIso?: string;
}

// --- month arithmetic -----------------------------------------------------

/** "2026-08-04" → "2026-08" */
export function monthOf(dateIso: string): string {
  return (dateIso || "").slice(0, 7);
}

/**
 * First and last day of a month, as ISO dates.
 *
 * Day 0 of the *next* month is the last day of this one, which gets February
 * and leap years right without a table.
 */
export function daysInMonth(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

// --- entitlement ----------------------------------------------------------

/**
 * Was this cover already paid for by the reservation?
 *
 * Two conditions, both required. On the breakfast roster AND carrying a package
 * that includes breakfast. A guest on the roster whose rate never included
 * breakfast is NOT entitled — reception has to charge them, and before this app
 * nobody noticed, which is the entire point of the headline figure.
 */
function isEntitled(room: RoomReport): boolean {
  const source = room.vipSource ?? "breakfast_list";
  return source === "breakfast_list" && room.hasBreakfast;
}

/**
 * Covers the reservation already covered.
 *
 * Capped at the room's booked party size on purpose: a room booked for two that
 * sends four down is entitled to two breakfasts, not four. The other two are
 * the off-list delta, and counting them here would erase them.
 */
function entitledCovers(report: DayReport): number {
  let n = 0;
  for (const room of report.rooms) {
    if (!isEntitled(room)) continue;
    n += Math.min(room.entered, room.totalGuests);
  }
  return n;
}

/**
 * The off-list total, split by how it was settled.
 *
 * Derived the same way as the total it breaks down — every non-entitled room
 * contributes all of its covers, every entitled room contributes only its
 * overflow — so the parts always sum to the whole. Summing the two obvious
 * sources instead (`walkInEntered + totalExtras`) double counts a walk-in who
 * brought more people than reception typed in, which is a normal morning.
 */
function offListLines(report: DayReport, into: Map<Formule | "extras", number>): void {
  for (const room of report.rooms) {
    if (isEntitled(room)) {
      const extras = Math.max(0, room.entered - room.totalGuests);
      if (extras > 0) into.set("extras", (into.get("extras") ?? 0) + extras);
      continue;
    }
    if (room.entered <= 0) continue;
    const f = formuleOf(room);
    into.set(f, (into.get(f) ?? 0) + room.entered);
  }
}

// --- VIPs -----------------------------------------------------------------

/**
 * VIPs expected, and VIPs who actually came down.
 *
 * Counted per service, not per guest: a VIP staying four nights is four
 * chances to get it right, and four is what the F&B team is staffing for.
 */
function countVips(report: DayReport): { total: number; served: number } {
  let total = 0;
  let served = 0;
  for (const room of report.rooms) {
    if (!room.isVip) continue;
    total += 1;
    if (room.entered > 0) served += 1;
  }
  return { total, served };
}

// --- the report -----------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeValueReport(
  days: DailyData[],
  month: string,
  assumptions: ValueAssumptions,
  ctx: ValueReportContext = {}
): ValueReport {
  const { first, last } = daysInMonth(month);

  // A day with a roster but no arrivals is a real service that nobody attended;
  // a day with neither is a day the app was not used, and averaging it in would
  // understate every figure here.
  const inMonth = days
    .filter((d) => d.date >= first && d.date <= last)
    .filter((d) => (d.clients?.length ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const breakdown = new Map<Formule | "extras", number>();
  let covers = 0;
  let offListCovers = 0;
  let vipsTotal = 0;
  let vipsServed = 0;
  let busiestService: BusiestService | null = null;
  let peakQuarter: PeakQuarter | null = null;

  for (const d of inMonth) {
    const report = generateDayReport(d.clients, d.checkIns, d.date);

    covers += report.totalEntered;
    offListCovers += report.totalEntered - entitledCovers(report);
    offListLines(report, breakdown);

    const vips = countVips(report);
    vipsTotal += vips.total;
    vipsServed += vips.served;

    if (report.totalEntered > 0 && (!busiestService || report.totalEntered > busiestService.covers)) {
      busiestService = { date: d.date, covers: report.totalEntered };
    }

    // Peak throughput is the worst quarter hour anywhere in the month — the one
    // the kitchen has to be able to absorb. An average would staff for a queue
    // that never happens.
    const affluence = buildAffluence(d.checkIns, PEAK_GRAIN_MINUTES);
    if (affluence.peakIndex >= 0 && affluence.peakCount > (peakQuarter?.covers ?? 0)) {
      const start = affluence.buckets[affluence.peakIndex].start;
      peakQuarter = { date: d.date, start, time: hhmm(start), covers: affluence.peakCount };
    }
  }

  const offListBreakdown: OffListLine[] = Array.from(breakdown.entries())
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({
      key,
      label: key === "extras" ? "Couverts supplémentaires" : FORMULE_LABEL[key],
      covers: n,
    }))
    .sort((a, b) => b.covers - a.covers);

  const hoursSaved = round2((covers * assumptions.secondsPerCover) / 3600);
  const staffValue =
    assumptions.hourlyRate === null ? null : round2(hoursSaved * assumptions.hourlyRate);
  const offListValue = round2(offListCovers * assumptions.breakfastPrice);
  const totalValue = staffValue === null ? null : round2(offListValue + staffValue);

  // How far back this device can still see. Anything before it was purged, so a
  // month that starts earlier is reported from an incomplete record.
  const retentionDays = ctx.retentionDays ?? 30;
  const today = ctx.todayIso ?? iso(new Date());
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
  const retainedFrom = iso(cutoff);

  return {
    month,
    hasData: inMonth.length > 0,
    daysActive: inMonth.length,
    firstDay: inMonth[0]?.date ?? "",
    lastDay: inMonth[inMonth.length - 1]?.date ?? "",
    covers,
    offListCovers,
    offListValue,
    offListBreakdown,
    hoursSaved,
    staffValue,
    busiestService,
    peakQuarter,
    vipsTotal,
    vipsServed,
    vipsMissed: Math.max(0, vipsTotal - vipsServed),
    totalValue,
    monthlyFee: assumptions.monthlyFee,
    retentionLimited: retainedFrom > first,
    retainedFrom,
    assumptions,
  };
}

