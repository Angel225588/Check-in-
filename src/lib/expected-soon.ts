/**
 * Who is still to come down, and when — for the "Attendus bientôt" pane.
 *
 * This exists because the pane and the guest screen disagreed in front of
 * reception: the pane offered room 201 at 07:30 while 201's own screen said
 * "Descend vers 09:40". Neither was a bad prediction. The pane was not
 * predicting at all — it printed `07:${15 + i * 6}`, a time made out of the
 * row's position in a list, identical for whoever happened to be first.
 *
 * So the arithmetic lives here, once, and both screens read it. Two screens
 * that compute the same claim from the same history cannot drift apart; two
 * screens that each compute their own always eventually do.
 *
 * What it will not say is as important as what it will. A guest with fewer
 * than three recorded mornings has no habit, only a coincidence. A guest whose
 * mornings are spread across hours has no usual time, and picking the middle
 * of that spread would dress a guess as a measurement. Both are left out, and
 * the pane says "rien de prévisible" — which is true, and useful, in a way
 * that a confident wrong number never is.
 */

import { arrivalPattern, hhmmOf, MIN_MORNINGS } from "./arrival-pattern";
import type { Client, CheckInRecord, SessionRecord } from "./types";
import { guestIdentity } from "./guest-identity";

export interface ExpectedGuest {
  roomNumber: string;
  surname: string;
  /** "09:40" — the guest's own median, the same string their screen shows. */
  at: string;
}

/**
 * How late a guest can be and still count as "bientôt".
 *
 * Someone whose habit is 07:30 and who has not appeared by 07:31 is on the
 * stairs. By 09:05 they are not coming soon, they are a different question,
 * and leaving them under this heading is how the pane starts lying again.
 */
const GRACE = 15;

/**
 * The same person however the arrivals list spelled them that morning.
 *
 * Re-exported from `guest-identity`, which is now the single definition. Guest
 * notes key on the very same function: a guest the app recognises for their
 * arrival habit and a guest it recognises for their allergy must be one guest.
 */
export const guestKey = guestIdentity;

/**
 * One arrival time per guest per morning, in minutes since local midnight.
 *
 * The FIRST check-in of a morning is the observation. A second cup at 10:15 is
 * not a second data point about when this guest comes down, and averaging it in
 * would push every regular's habit later the more they ate.
 */
export function arrivalMinutesByGuest(
  history: SessionRecord[],
  todayIso: string
): Map<string, number[]> {
  const byGuest = new Map<string, number[]>();
  for (const sess of history) {
    // A morning still in progress is not history — half its arrivals have not
    // happened yet, and counting them would drag every habit earlier all day.
    if (!sess?.date || sess.date === todayIso) continue;

    const firstOfMorning = new Map<string, number>();
    for (const c of sess.checkIns ?? []) {
      const when = new Date(c.timestamp);
      if (isNaN(when.getTime())) continue;
      const mins = when.getHours() * 60 + when.getMinutes();
      const k = guestKey(c.clientName);
      const seen = firstOfMorning.get(k);
      if (seen === undefined || mins < seen) firstOfMorning.set(k, mins);
    }
    for (const [k, mins] of firstOfMorning) {
      const list = byGuest.get(k);
      if (list) list.push(mins);
      else byGuest.set(k, [mins]);
    }
  }
  for (const list of byGuest.values()) list.sort((a, b) => a - b);
  return byGuest;
}

/**
 * Guests in today's house whose usual hour is still ahead, soonest first.
 *
 * `nowMinutes` is passed in rather than read from the clock so the harness can
 * stand at 07:00 and at 09:05 and check that the pane answers differently.
 */
export function expectedSoon(
  todayClients: Client[],
  todayCheckIns: Pick<CheckInRecord, "roomNumber" | "clientName">[],
  history: SessionRecord[],
  todayIso: string,
  nowMinutes: number,
  limit = 3
): ExpectedGuest[] {
  const minutes = arrivalMinutesByGuest(history, todayIso);
  const done = new Set(todayCheckIns.map((c) => guestKey(c.clientName)));

  const rows: (ExpectedGuest & { at_: number })[] = [];
  for (const c of todayClients) {
    const k = guestKey(c.name);
    if (done.has(k)) continue;

    const pattern = arrivalPattern(minutes.get(k) ?? [], MIN_MORNINGS);
    // No habit, or an hour so wide there is no usual one: say nothing.
    if (!pattern || !pattern.steady) continue;
    if (pattern.typical < nowMinutes - GRACE) continue;

    rows.push({
      roomNumber: c.roomNumber,
      surname: c.name.split(/[\/,]/)[0].trim().split(/\s+/)[0],
      at: hhmmOf(pattern.typical),
      at_: pattern.typical,
    });
  }

  return rows
    .sort((a, b) => a.at_ - b.at_ || a.roomNumber.localeCompare(b.roomNumber))
    .slice(0, limit)
    .map(({ at_: _at, ...row }) => row);
}
