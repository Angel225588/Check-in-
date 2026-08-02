/**
 * Groups, and the children count that sits next to them.
 *
 * A tour is the single biggest thing that happens to a breakfast service: forty
 * people arrive inside twenty minutes because a coach leaves at nine. Counting
 * those forty the same way as forty individuals hides the only fact that
 * changes how the morning is staffed.
 *
 * `BKF GRP` was already parsed and already meant nothing beyond "has
 * breakfast". It is the group marker, but it does not say WHICH group — every
 * tour in the house carries the same package code. The block is recovered from
 * three things together: the group package, the rate code the tour operator
 * booked on, and the stay window they share.
 */

import type { Client } from "./types";

export interface GroupBlock {
  /** Stable identity for the block: rate code + stay window. */
  key: string;
  rateCode: string;
  arrivalDate: string;
  departureDate: string;
  rooms: number;
  people: number;
  roomNumbers: string[];
}

/** Rooms whose package marks them as part of a group booking. */
function isGroupRoom(c: Client): boolean {
  return /BKF\s*GRP/i.test(c.packageCode || "");
}

function paxOf(c: Client): number {
  return (Number(c.adults) || 0) + (Number(c.children) || 0);
}

export function getChildrenCount(clients: Client[]): number {
  return clients.reduce((n, c) => n + (Number(c.children) || 0), 0);
}

/**
 * Group bookings in the house, biggest first.
 *
 * A block of one room is not returned. A single `BKF GRP` room is a data quirk
 * — a straggler, a rate applied by hand — and reporting "4 groups" when there
 * is one coach and three strays would make the number useless for staffing.
 */
export function groupBlocks(clients: Client[]): GroupBlock[] {
  const byKey = new Map<string, GroupBlock>();

  for (const c of clients) {
    if (!isGroupRoom(c)) continue;
    const rateCode = (c.rateCode || "").trim().toUpperCase();
    const key = `${rateCode}|${c.arrivalDate}|${c.departureDate}`;
    const block = byKey.get(key) ?? {
      key,
      rateCode,
      arrivalDate: c.arrivalDate,
      departureDate: c.departureDate,
      rooms: 0,
      people: 0,
      roomNumbers: [],
    };
    block.rooms += 1;
    block.people += paxOf(c);
    block.roomNumbers.push(c.roomNumber);
    byKey.set(key, block);
  }

  return [...byKey.values()]
    .filter((b) => b.rooms > 1)
    .sort((a, b) => b.people - a.people);
}

export function getGroupStats(clients: Client[]): { blocks: number; rooms: number; people: number } {
  const blocks = groupBlocks(clients);
  return {
    blocks: blocks.length,
    rooms: blocks.reduce((n, b) => n + b.rooms, 0),
    people: blocks.reduce((n, b) => n + b.people, 0),
  };
}

/** True when this room belongs to a real block — used to filter the list. */
export function isInGroupBlock(client: Client, blocks: GroupBlock[]): boolean {
  return blocks.some((b) => b.roomNumbers.includes(client.roomNumber));
}
