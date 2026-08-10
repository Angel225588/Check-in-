/**
 * Which metrics earn a visible slot today.
 *
 * A fixed order is wrong on most mornings. A day with three coaches and a day
 * with none want different tiles in front, and a metric reading zero teaches
 * nothing while costing a slot something else needs. So the row is ordered by
 * what this particular service actually contains.
 *
 * Two things are deliberately NOT data-driven:
 *
 * The outcome trio — entered, absent, partial — always leads, in that order.
 * They are the report. A row whose first tile moves around between mornings
 * cannot be read at a glance, and the whole point of the row is the glance.
 *
 * Membership never changes, only order. Everything is still reachable in the
 * funnel; ranking decides what is in front, not what exists. A metric that
 * disappears entirely is a metric someone goes hunting for.
 */

export interface RankTile {
  key: string;
  value: number;
}

export interface RankInput {
  /** Rooms in the day, for scoring a count against the size of the service. */
  rooms: number;
  tiles: RankTile[];
}

/** Always in front, in this order. The service's outcome is not negotiable.
 *  "servis" is the arrivals tile — everyone who got breakfast, rooms fully in
 *  and rooms that partly came. It was keyed "in" while it counted only the
 *  former. */
const CORE = ["servis", "in", "no", "partial"];

/**
 * How much a metric matters beyond its raw size.
 *
 * Écarts are errors in the source data: never a big number, and never
 * unimportant — three wrong rooms is three conversations at the desk. Groups
 * decide the shape of the morning, so a single block outranks a larger count
 * of something incidental.
 */
const WEIGHT: Record<string, number> = {
  ecart: 6,
  groupe: 3,
  enfants: 1.4,
  offlist: 2,
  vip: 1,
  comp: 1,
  echange: 2,
};

export function rankTiles(input: RankInput): RankTile[] {
  const rooms = Math.max(1, input.rooms || 0);

  const score = (t: RankTile): number => {
    if (t.value <= 0) return -1;                    // zero teaches nothing
    const share = t.value / rooms;                  // size relative to the day
    return share * (WEIGHT[t.key] ?? 1);
  };

  const core: RankTile[] = [];
  for (const key of CORE) {
    const t = input.tiles.find((x) => x.key === key);
    if (t) core.push(t);
  }

  const rest = input.tiles
    .filter((t) => !CORE.includes(t.key))
    .sort((a, b) => {
      const d = score(b) - score(a);
      if (d !== 0) return d;
      // Stable, so a row does not reshuffle between two equally quiet metrics.
      return a.key.localeCompare(b.key);
    });

  return [...core, ...rest];
}
