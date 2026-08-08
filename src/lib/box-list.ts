/**
 * US-34 — paniers petit-déjeuner.
 *
 * A coach with a 06:45 departure never sits down. It collects paper bags at
 * the desk: one run, forty rooms, three minutes, a driver waiting outside.
 * Reception's job in those three minutes is to tick rooms off a manifest and
 * see instantly which one has not come — not to type a room number, wait for a
 * card to resolve, press a green button, and start again forty times.
 *
 * So this is a list, not a search: every room of the picked group on its own
 * line, in room order, with one tap per line.
 *
 * **A box is breakfast.** It counts as served, or the morning's figure is short
 * by a coach and the kitchen's numbers stop meaning anything. What it is not is
 * a payment: `viaBox` sits beside `paymentAction`, never instead of it — a
 * group on a room charge that takes bags is still a room charge.
 */

import type { Client, CheckInRecord } from "./types";
import { getEnteredForClient } from "./utils";

export interface BoxRow {
  roomNumber: string;
  name: string;
  /** People the room is due. */
  due: number;
  /** People already served, by any route. */
  taken: number;
  done: boolean;
  /** True when what they took was a box. Kept so the row can say so. */
  viaBox: boolean;
  client: Client;
}

export function boxRows(clients: Client[], checkIns: CheckInRecord[]): BoxRow[] {
  return clients
    .map((c) => {
      const due = (Number(c.adults) || 0) + (Number(c.children) || 0);
      const taken = getEnteredForClient(c, checkIns);
      const mine = checkIns.filter((x) => x.roomNumber === c.roomNumber);
      return {
        roomNumber: c.roomNumber,
        name: c.name,
        due,
        taken,
        /* Served is served. Someone who ate in the restaurant is not still owed
           a bag, and showing them as owed sends reception chasing a guest who
           is sitting down eating. */
        done: taken >= due && due > 0,
        viaBox: mine.some((x) => x.viaBox),
        client: c,
      };
    })
    /* Room order, not arrival order. The list is read against a paper manifest
       and a coach's rooms run consecutively — sorting by who came first would
       reshuffle the list under the finger with every tick. */
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
}

/**
 * The record one tap makes: the whole room, in one go.
 *
 * Null when the room owes nothing — a second tap on a done row must not put
 * two breakfasts on one guest.
 */
export function boxRecord(
  client: Client,
  checkIns: CheckInRecord[],
  id: string,
  now: Date = new Date(),
): CheckInRecord | null {
  const due = (Number(client.adults) || 0) + (Number(client.children) || 0);
  const already = getEnteredForClient(client, checkIns);
  const left = due - already;
  if (left <= 0) return null;
  return {
    id,
    roomNumber: client.roomNumber,
    clientName: client.name,
    peopleEntered: left,
    timestamp: now.toISOString(),
    viaBox: true,
  };
}

/** How far through the run we are: the only number this screen owes anyone. */
export function boxCount(rows: BoxRow[]): { done: number; of: number } {
  return { done: rows.filter((r) => r.done).length, of: rows.length };
}
