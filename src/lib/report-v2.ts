import { CheckInRecord } from "./types";
import { DayReport, RoomReport } from "./report";

/**
 * The arithmetic behind the service report, kept away from the rendering.
 *
 * Everything here is pure: the same inputs give the same figures whether they
 * come from today's localStorage, a closed session, or a test. The screen used
 * to compute several of these inline, and two of them were quietly wrong — a
 * hand-typed presence percentage that disagreed with the tiles beside it, and
 * a time built by concatenation that produced "010:05" and then broke the
 * string-compared arrival sort.
 */

/** Breakfast service window, in minutes since midnight. */
export const SERVICE_OPEN = 6 * 60 + 30;
export const SERVICE_CLOSE = 10 * 60 + 30;

/** The granularities offered on the affluence chart; anything else is custom. */
export const GRAINS = [5, 10, 15, 30] as const;

const DEFAULT_GRAIN = 15;
const MIN_GRAIN = 1;
const MAX_GRAIN = 120;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Minutes since midnight → "HH:MM", wrapping rather than overflowing. */
export function hhmm(minutes: number): string {
  if (!Number.isFinite(minutes)) return "00:00";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Local wall-clock minutes for an ISO timestamp, or null if it is unusable. */
export function minutesOfDay(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export interface AffluenceBucket {
  /** Minutes since midnight at the bucket's left edge. */
  start: number;
  /** People — not check-ins. Four people through one door is a queue of four. */
  count: number;
}

export interface Affluence {
  buckets: AffluenceBucket[];
  grain: number;
  open: number;
  close: number;
  /** Index of the busiest bucket, or -1 when nobody came. */
  peakIndex: number;
  peakCount: number;
  total: number;
}

function clampGrain(grain: number): number {
  if (!Number.isFinite(grain) || grain < MIN_GRAIN) return DEFAULT_GRAIN;
  return Math.min(MAX_GRAIN, Math.round(grain));
}

/**
 * Arrivals bucketed for the affluence chart.
 *
 * The window stretches to cover the data. Somebody who walks in at 06:05 is a
 * real person, and a chart that silently drops them disagrees with the totals
 * printed next to it — which is worse than an ugly axis.
 */
export function buildAffluence(checkIns: CheckInRecord[], grain: number): Affluence {
  const g = clampGrain(grain);
  const arrivals: Array<{ min: number; pax: number }> = [];
  for (const c of checkIns ?? []) {
    const min = minutesOfDay(c.timestamp);
    if (min === null) continue;
    arrivals.push({ min, pax: Math.max(0, c.peopleEntered || 0) });
  }

  let open = SERVICE_OPEN;
  let close = SERVICE_CLOSE;
  for (const a of arrivals) {
    if (a.min < open) open = Math.floor(a.min / g) * g;
    if (a.min >= close) close = (Math.floor(a.min / g) + 1) * g;
  }

  const n = Math.max(1, Math.ceil((close - open) / g));
  const buckets: AffluenceBucket[] = Array.from({ length: n }, (_, i) => ({
    start: open + i * g,
    count: 0,
  }));

  let total = 0;
  for (const a of arrivals) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((a.min - open) / g)));
    buckets[i].count += a.pax;
    total += a.pax;
  }

  let peakIndex = -1;
  let peakCount = 0;
  buckets.forEach((b, i) => {
    if (b.count > peakCount) {
      peakCount = b.count;
      peakIndex = i;
    }
  });

  return { buckets, grain: g, open, close, peakIndex, peakCount, total };
}

/** How the breakfast was covered — what the F&B briefing reads down the list. */
export type Formule =
  | "inclus"
  | "comp"
  /** A VIP kept their points and put breakfast on the room instead. Its own
   *  formule rather than "inclus", because the reservation never included
   *  breakfast — reception offered the swap and the guest took it, and the
   *  briefing wants to know how often that happens. */
  | "echange"
  | "points"
  | "chambre"
  | "carte"
  | "cash"
  | "supervisor"
  | "a-encaisser";

export const FORMULE_LABEL: Record<Formule, string> = {
  inclus: "Inclus",
  comp: "COMP",
  echange: "Échangé",
  points: "Points",
  chambre: "Chambre",
  carte: "Carte",
  cash: "Cash",
  supervisor: "Superviseur",
  "a-encaisser": "À encaisser",
};

/**
 * COMP and INCLUS come from the reservation; everything else comes from what
 * reception actually chose at the door. A guest with no package who has not
 * been through yet is "à encaisser" — the open question, not a decision.
 */
export function formuleOf(room: {
  isComp: boolean;
  hasBreakfast: boolean;
  entered: number;
  paymentAction?: string;
}): Formule {
  if (room.isComp) return "comp";
  if (room.hasBreakfast) return "inclus";
  switch (room.paymentAction) {
    case "points_to_bkf": return "echange";
    case "points": return "points";
    case "cash":
    case "pay_onsite": return "cash";
    case "room":
    case "room_charge": return "chambre";
    case "card": return "carte";
    case "supervisor":
    case "pass": return "supervisor";
    default: return "a-encaisser";
  }
}

export interface ArrivalRow {
  roomNumber: string;
  name: string;
  status: RoomReport["status"];
  entered: number;
  totalGuests: number;
  extras: number;
  isVip: boolean;
  vipLevel: string;
  isComp: boolean;
  /** Children expected in the room. The report is where the afternoon team
   *  finds out a high chair was needed. */
  children: number;
  /** VIP who was not on the breakfast list — reception cares who these were. */
  offList: boolean;
  formule: Formule;
  /** Minutes since midnight of the first arrival, or null for a no-show. */
  minutes: number | null;
  time: string;
}

function firstArrivalMinutes(
  room: RoomReport,
  checkIns: CheckInRecord[]
): number | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  let best: number | null = null;
  for (const c of checkIns) {
    if (c.roomNumber !== room.roomNumber) continue;
    if (norm(c.clientName) !== norm(room.name)) continue;
    const m = minutesOfDay(c.timestamp);
    if (m === null) continue;
    if (best === null || m < best) best = m;
  }
  return best;
}

/** Rooms in the order people actually walked in; no-shows fall to the end. */
export function buildArrivalRows(report: DayReport): ArrivalRow[] {
  const rows: ArrivalRow[] = report.rooms.map((r) => {
    const minutes = firstArrivalMinutes(r, report.checkIns);
    return {
      roomNumber: r.roomNumber,
      name: r.name,
      status: r.status,
      entered: r.entered,
      totalGuests: r.totalGuests,
      extras: r.extras,
      isVip: r.isVip,
      vipLevel: r.vipLevel,
      isComp: r.isComp,
      children: Math.max(0, (r.totalGuests || 0) - (r.adults || 0)),
      offList: !!r.isVip && (r.vipSource === "list_only" || r.vipSource === "walk_in"),
      formule: formuleOf(r),
      minutes,
      time: minutes === null ? "—" : hhmm(minutes),
    };
  });

  return rows.sort((a, b) => {
    if (a.minutes === null && b.minutes === null) {
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    }
    if (a.minutes === null) return 1;
    if (b.minutes === null) return -1;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });
}

export type ReportFilter =
  | "all"
  | "in"
  | "partial"
  | "no"
  | "vip"
  | "comp"
  | "offlist"
  | "ecart"
  | "groupe"
  | "enfants"
  | "echange";

/** Accent-blind, case-blind. "lefevre" has to find "LEFÈVRE". */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterRows(
  rows: ArrivalRow[],
  filter: ReportFilter,
  query: string,
  ecartRooms: Set<string>,
  /** Rooms belonging to a group block. Handed in like ecartRooms, because a
   *  room cannot tell you which tour it is on — every tour in the house shares
   *  the same BKF GRP package code, so the block is resolved from the original
   *  client list and passed down. */
  groupRooms: Set<string> = new Set()
): ArrivalRow[] {
  const q = fold((query ?? "").trim());
  return rows.filter((r) => {
    switch (filter) {
      case "in":
        if (r.status !== "all-in") return false;
        break;
      case "partial":
        if (r.status !== "partial") return false;
        break;
      case "no":
        if (r.status !== "no-show") return false;
        break;
      case "vip":
        if (!r.isVip) return false;
        break;
      case "comp":
        if (!r.isComp) return false;
        break;
      case "offlist":
        if (!r.offList) return false;
        break;
      case "ecart":
        if (!ecartRooms.has(r.roomNumber)) return false;
        break;
      case "groupe":
        if (!groupRooms.has(r.roomNumber)) return false;
        break;
      case "enfants":
        if (r.children <= 0) return false;
        break;
      case "echange":
        if (r.formule !== "echange") return false;
        break;
      default:
        break;
    }
    if (!q) return true;
    return r.roomNumber.startsWith(q) || fold(r.name).includes(q);
  });
}

export interface OutcomeSplit {
  allIn: number;
  partial: number;
  noShow: number;
  total: number;
}

export function outcomeSplit(rows: ArrivalRow[]): OutcomeSplit {
  let allIn = 0;
  let partial = 0;
  let noShow = 0;
  for (const r of rows) {
    if (r.status === "all-in") allIn++;
    else if (r.status === "partial") partial++;
    else noShow++;
  }
  return { allIn, partial, noShow, total: rows.length };
}

export interface TreemapShare {
  /** Fraction of the axis this block gets, 0–1. The set always sums to 1. */
  share: number;
  /** True when the block was widened past its real proportion to stay legible. */
  floored: boolean;
}

/**
 * Split an axis between blocks by magnitude, but never below a legibility floor.
 *
 * Pure area encoding is the point of the treemap, and it fails at the bottom:
 * a zero-value block becomes a 12px sliver with "P… 0 0.0 %" clipped down its
 * middle, which is worse than a slightly wrong area. Blocks under the floor are
 * raised to it and the rest give up space proportionally; `floored` says which,
 * so the view can drop to a compact label instead of pretending.
 */
export function treemapShares(values: number[], floor = 0.3): TreemapShare[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [{ share: 1, floored: false }];

  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  // A zero block is not a small block: the day had none of that outcome, and
  // drawing an empty rectangle invents a category. It gets no space at all —
  // the caller drops it — and the floor is left to handle small-but-real.
  const present = safe.filter((v) => v > 0).length;
  if (present > 0 && present < n) {
    const inner = treemapShares(safe.filter((v) => v > 0), floor);
    let i = 0;
    return safe.map((v) => (v > 0 ? inner[i++] : { share: 0, floored: false }));
  }

  const total = safe.reduce((a, b) => a + b, 0);
  // No data at all: an even split says "nothing here" without dividing by zero.
  if (total === 0) return safe.map(() => ({ share: 1 / n, floored: true }));

  // With enough blocks the floor cannot be honoured at all; fall back to even.
  const f = Math.max(0, Math.min(floor, 1 / n));
  const raw = safe.map((v) => v / total);
  const short = raw.map((r) => Math.max(0, f - r));
  const deficit = short.reduce((a, b) => a + b, 0);
  if (deficit === 0) return raw.map((share) => ({ share, floored: false }));

  // The surplus above the floor is what can be taken from, proportionally.
  const surplus = raw.reduce((a, r) => a + Math.max(0, r - f), 0);
  return raw.map((r) => {
    if (r < f) return { share: f, floored: true };
    const give = surplus > 0 ? ((r - f) / surplus) * deficit : 0;
    return { share: r - give, floored: false };
  });
}

/**
 * Presence as a share of people, not rooms — a full family and a lone traveller
 * are not the same amount of breakfast. Capped, because more people can turn up
 * than the sheet expected and "112 %" reads as a bug.
 */
export function presencePercent(report: DayReport): number {
  if (!report.totalGuests) return 0;
  return Math.min(100, Math.round((report.totalEntered / report.totalGuests) * 100));
}
