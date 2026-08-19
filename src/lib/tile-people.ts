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
export function peopleExpected(rows: ArrivalRow[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.totalGuests || 0), 0);
}

/**
 * A membership tile counts rooms whether or not anyone came, so its people
 * figure has to count the same guests — the reservation, not the arrivals.
 *
 * Counting arrivals under a room count that ignores them printed "VIP 18 ch. /
 * 0 pers." at 06:35, a tile contradicting itself in two lines.
 */
const pairOf = (rows: ArrivalRow[]): Pair => ({ rooms: rows.length, people: peopleExpected(rows) });

/**
 * COMP counts ADULTS, not everyone in the room.
 *
 * The hotel's R118 "Totals per Day per Package Code" is the figure reception
 * is measured on, and it counts adults: on the real export 13 COMP rooms are
 * 20 adults + 1 child and the paper prints 20. report.ts already computed
 * totalCompPersons this way; the tile did not, so the same morning read 20 on
 * one screen and 21 on another. Children eat free — stated separately.
 */
const pairComp = (rows: ArrivalRow[]): Pair => ({
  rooms: rows.length,
  people: rows.reduce((n, r) => n + Math.max(0, (r.totalGuests || 0) - (r.children || 0)), 0),
});

const pairIn = (rows: ArrivalRow[]): Pair => ({ rooms: rows.length, people: peopleIn(rows) });

export interface TilePeople {
  in: Pair;
  /** An absent room's people are the ones who did not come — the covers the
   *  kitchen laid and nobody sat at. `entered` there is zero and says nothing. */
  no: Pair;
  partial: Pair;
  vip: Pair;
  comp: Pair;
  /** Children in COMP rooms. They eat free and the report does not count them,
   *  so the number is stated rather than folded into the COMP total. */
  compChildren: number;
  /** Rooms with a child in them, and how many children that is. The tile used
   *  to print the CHILD count as its headline, so its "3" meant three children
   *  while every tile beside it meant three rooms — and clicking it produced a
   *  row count that matched nothing on its face. */
  children: Pair;
  /** People expected across the whole day, and people served. */
  expected: number;
  served: number;
  /**
   * People of the house who did not get breakfast: expected minus served.
   *
   * NOT the same as `no.people`, which is what the absent ROOMS were due. When
   * two unexpected guests turn up, the absent rooms are still owed their three
   * covers but the house has only lost one — and that difference is why the
   * ring read 86 % beside a répartition reading 84.6 %.
   *
   * This is the figure the panel splits on, because `in + partial + missing`
   * adds back to `expected` exactly, so every percentage on the report divides
   * by the same number.
   */
  missing: number;
  /** Share of PEOPLE, capped. Rooms would give a different answer for the same
   *  morning, and breakfast is not ordered by the door. */
  percent: number;
}

export function tilePeople(rows: ArrivalRow[]): TilePeople {
  const noShow = rows.filter((r) => r.status === "no-show");
  const withChildren = rows.filter((r) => (r.children || 0) > 0);
  const expected = peopleExpected(rows);
  const served = peopleIn(rows);

  return {
    in: pairIn(rows.filter((r) => r.status === "all-in")),
    no: { rooms: noShow.length, people: peopleExpected(noShow) },
    partial: pairIn(rows.filter((r) => r.status === "partial")),
    vip: pairOf(rows.filter((r) => r.isVip)),
    comp: pairComp(rows.filter((r) => r.isComp)),
    compChildren: rows
      .filter((r) => r.isComp)
      .reduce((n, r) => n + Math.max(0, r.children || 0), 0),
    children: {
      rooms: withChildren.length,
      people: withChildren.reduce((n, r) => n + (r.children || 0), 0),
    },
    expected,
    served,
    missing: Math.max(0, expected - served),
    percent: expected === 0 ? 0 : Math.min(100, Math.round((served / expected) * 100)),
  };
}

/** "60 pers." — the shape the tile prints under its room count. */
export function paxLabel(people: number): string {
  return `${people} pers.`;
}
