/**
 * US-21 — one coach, not all of them.
 *
 * "Groupes" as one on/off lumps every tour on the morning together, and two
 * coaches behave nothing alike: one leaves at seven and eats at 06:35, the
 * other is still asleep at nine. Reception filtering for "the group" almost
 * always means a particular one.
 *
 * Nothing picked means all of them. The pill keeps working as a pill — the
 * checklist is what you open when you want less than everything, and an empty
 * selection must never mean an empty screen.
 */

import type { Client } from "./types";
import type { GroupBlock } from "./groups";

/** A block answers to its key or to the rate code the tour booked on. */
function matches(block: GroupBlock, picked: string[]): boolean {
  return picked.includes(block.key) || picked.includes(block.rateCode);
}

/**
 * The rooms a group filter should show.
 *
 * Only ever rooms that belong to a real block: an individual never comes in
 * through a group filter, whatever is picked.
 */
export function pickGroups(
  clients: Client[],
  blocks: GroupBlock[],
  picked: string[],
): Client[] {
  const chosen = picked.length ? blocks.filter((b) => matches(b, picked)) : blocks;

  // A stored pick can outlive the day it was made — yesterday's coach is gone
  // by the time the list is uploaded. All of them beats none of them: an empty
  // screen reads as "no groups today", which is a different and wrong fact.
  const live = chosen.length ? chosen : blocks;

  const rooms = new Set(live.flatMap((b) => b.roomNumbers));
  return clients.filter((c) => rooms.has(c.roomNumber));
}

/** Tick and untick. Unticking the last one lands back on all of them. */
export function toggleGroup(picked: string[], key: string): string[] {
  return picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
}
