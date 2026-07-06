import { Client } from "./types";
import { isComp, needsPaymentChoice } from "./utils";

/** Start-of-day package distribution shown on the resume screen after an upload. */
export interface ImpactSummary {
  /** Total covers expected (sum of adults + children across the roster). */
  total: number;
  /** Breakfast included in the booking (BKF INC/EXCL/GTT/UPS PDJ), excl. comp & group (pax). */
  inclus: number;
  /** Offered by management — BKF COMP (pax). */
  comp: number;
  /** Group breakfast — BKF GRP (pax). */
  groupe: number;
  /** Not on a breakfast package / off-list — to charge at the counter (pax). */
  hors: number;
  /** VIP covers — an OVERLAY highlight, not part of the partition. */
  vip: number;
  /** Number of rooms (roster rows). */
  rooms: number;
  /** Adults across the roster. */
  adults: number;
  /** Children across the roster. */
  children: number;
}

function pax(c: Client): number {
  return (c.adults || 0) + (c.children || 0);
}

function isGroup(c: Client): boolean {
  return c.packageCode.toUpperCase().replace(/\s+/g, " ").includes("BKF GRP");
}

/**
 * Derive the package distribution from the parsed roster.
 *
 * comp / groupe / inclus / hors are a strict partition (every guest lands in exactly
 * one): isComp → comp; else BKF GRP → groupe; else breakfast-covered → inclus; else
 * (needs payment) → hors. So they re-sum to the total — the boxes read as coherent,
 * each one a real category from the report (no ambiguous "à vérifier"). VIP is an overlay.
 */
export function computeImpact(clients: Client[]): ImpactSummary {
  let total = 0;
  let inclus = 0;
  let comp = 0;
  let groupe = 0;
  let hors = 0;
  let vip = 0;
  let adults = 0;
  let children = 0;

  for (const c of clients) {
    const p = pax(c);
    total += p;
    adults += c.adults || 0;
    children += c.children || 0;
    if (isComp(c)) comp += p;
    else if (isGroup(c)) groupe += p;
    else if (!needsPaymentChoice(c)) inclus += p;
    else hors += p;
    if (c.isVip) vip += p;
  }

  return { total, inclus, comp, groupe, hors, vip, rooms: clients.length, adults, children };
}
