/**
 * "How many are coming, and how many came."
 *
 * A pill reading "COMP 15" answers half of what reception is asking, and drops
 * the half that changes what they do next: fifteen comps of which two have come
 * is a morning with thirteen conversations still in it. Landscape has said
 * `2/15` for comps since the beginning; the portrait bar lost it in the port.
 *
 * People, not rooms — a room is not what walks into the restaurant.
 */

import type { Client, CheckInRecord } from "./types";
import { getEnteredForClient } from "./utils";

export interface Progress {
  done: number;
  of: number;
}

export function subsetProgress(
  clients: Client[],
  checkIns: CheckInRecord[],
  inSet: (c: Client) => boolean,
): Progress | null {
  const set = clients.filter(inSet);
  const of = set.reduce((n, c) => n + (Number(c.adults) || 0) + (Number(c.children) || 0), 0);
  if (of <= 0) return null;

  /* Capped at the expected count. Three people walking in on a room booked for
     two is an écart — the report names it and reception settles it — but a
     pill reading 5/4 just looks broken, and the bar is not where that
     conversation belongs. */
  const done = Math.min(
    of,
    set.reduce((n, c) => n + getEnteredForClient(c, checkIns), 0),
  );
  return { done, of };
}
