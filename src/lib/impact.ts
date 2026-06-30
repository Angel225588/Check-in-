import { Client } from "./types";
import { isComp, needsPaymentChoice } from "./utils";

/** Start-of-day breakdown shown on the impact screen after an upload is analysed. */
export interface ImpactSummary {
  /** Total covers expected (sum of adults + children across the roster). */
  total: number;
  /** Breakfast covered by the booking, excluding comp (pax). */
  inclus: number;
  /** Offered by management — BKF COMP (pax). */
  comp: number;
  /** VIP covers — an OVERLAY highlight, not part of the inclus/comp/hors partition. */
  vip: number;
  /** Not on a breakfast package / off-list — to charge at the counter (pax). */
  hors: number;
  /** Rows with missing name/room or zero pax — a data-quality flag to re-check. */
  aVerifier: number;
  /** Number of rooms (roster rows). */
  rooms: number;
}

function pax(c: Client): number {
  return (c.adults || 0) + (c.children || 0);
}

function isIncomplete(c: Client): boolean {
  return pax(c) === 0 || !c.name.trim() || !c.roomNumber.trim();
}

/**
 * Derive the impact breakdown from the parsed roster.
 *
 * comp / inclus / hors are a strict partition (every guest lands in exactly one),
 * so comp + inclus + hors === total by construction — the number reads as coherent
 * to the team instead of relying on a fragile "stated vs computed" gap. The honest
 * "à vérifier" signal is therefore data quality (incomplete OCR rows), not arithmetic.
 */
export function computeImpact(clients: Client[]): ImpactSummary {
  let total = 0;
  let inclus = 0;
  let comp = 0;
  let vip = 0;
  let hors = 0;
  let aVerifier = 0;

  for (const c of clients) {
    const p = pax(c);
    total += p;
    if (isComp(c)) comp += p;
    else if (!needsPaymentChoice(c)) inclus += p;
    else hors += p;
    if (c.isVip) vip += p;
    if (isIncomplete(c)) aVerifier += 1;
  }

  return { total, inclus, comp, vip, hors, aVerifier, rooms: clients.length };
}
