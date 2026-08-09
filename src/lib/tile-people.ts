/**
 * Every report tile in both units.
 *
 * The metrics bar on the search screen counts PEOPLE — "Entrés 60" is sixty
 * breakfasts. The report tile counted ROOMS — "Entrés 30" is thirty doors. Same
 * word, same morning, two screens a minute apart, and the report looked like it
 * had mislaid half the service.
 *
 * Rooms stay the headline on a tile, because a tile is a filter and the list it
 * filters is a list of rooms: a tile reading 60 that produces 30 rows would move
 * the same contradiction one tap deeper. The people figure rides alongside it,
 * so the number reception is actually asked for — how many had breakfast — is
 * on the screen rather than inferred.
 *
 * "People" means who walked in, except for absences, where it means who was
 * expected and did not. That is the only reading of an absent room that tells
 * the kitchen anything.
 */

import type { ArrivalRow } from "./report-v2";

export interface Pair {
  rooms: number;
  people: number;
}

/** People through the door in these rooms. */
export function peopleIn(rows: ArrivalRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.entered || 0), 0);
}

/** People these rooms were expected to bring. */
function peopleExpected(rows: ArrivalRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.totalGuests || 0), 0);
}

const pairIn = (rows: ArrivalRow[]): Pair => ({ rooms: rows.length, people: peopleIn(rows) });

export interface TilePeople {
  in: Pair;
  /** An absent room's people are the ones who did not come — the covers the
   *  kitchen laid and nobody sat at. `entered` there is zero and says nothing. */
  no: Pair;
  partial: Pair;
  vip: Pair;
  comp: Pair;
  /** People expected across the whole day, and people served. */
  expected: number;
  served: number;
  /** Share of PEOPLE, capped. Rooms would give a different answer for the same
   *  morning, and breakfast is not ordered by the door. */
  percent: number;
}

export function tilePeople(rows: ArrivalRow[]): TilePeople {
  const noShow = rows.filter((r) => r.status === "no-show");
  const expected = peopleExpected(rows);
  const served = peopleIn(rows);

  return {
    in: pairIn(rows.filter((r) => r.status === "all-in")),
    no: { rooms: noShow.length, people: peopleExpected(noShow) },
    partial: pairIn(rows.filter((r) => r.status === "partial")),
    vip: pairIn(rows.filter((r) => r.isVip)),
    comp: pairIn(rows.filter((r) => r.isComp)),
    expected,
    served,
    percent: expected === 0 ? 0 : Math.min(100, Math.round((served / expected) * 100)),
  };
}

/** "60 pers." — the shape the tile prints under its room count. */
export function paxLabel(people: number): string {
  return `${people} pers.`;
}
