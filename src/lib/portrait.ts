/**
 * Portrait's layout arithmetic, kept out of the component so the decisions can
 * be argued with in a test rather than in a screenshot.
 *
 * Landscape has two columns because the hand rests on the right and the eye
 * reads on the left. Portrait has one column, one thumb, and a keyboard-sized
 * zone at the bottom that is the only part of the screen a standing person can
 * reach without regripping. So the pad is fixed, and everything else is what
 * fits above it.
 */

export type PortraitSlot = "idle" | "card" | "list" | "flash";

export interface SlotState {
  query: string;
  filter: string | null;
  /** A single unambiguous room resolved from the query. */
  hasHit: boolean;
  /** A check-in was just committed and is still being confirmed. */
  flash: boolean;
}

/**
 * Which face the one body slot shows — Option B, decided in HTML at 320px.
 *
 * The alternative kept the results list under the field and shrank the card to
 * fit above the pad. At 320px that took the room number down to 34px and left
 * no line for an allergy chip, which is the one thing the whole search screen
 * exists to protect (US-2, US-6). The list and the card never serve at the
 * same moment anyway: at rest you are looking at the last guest, while typing
 * you are looking at candidates. So they take turns.
 *
 * Order matters. A resolved room outranks everything, including a confirmation
 * still fading from the previous guest — the queue has moved on. And a
 * confirmation only survives while nothing is typed, so it can never sit on
 * screen next to a different room's digits.
 */
export function portraitSlot({ query, filter, hasHit, flash }: SlotState): PortraitSlot {
  if (hasHit) return "card";
  if (query.trim() || filter) return "list";
  if (flash) return "flash";
  return "idle";
}

export interface MetricCandidate {
  key: string;
  value: number;
}

/** The three that answer "where are we", in reading order. Always shown. */
const CORE = ["total", "entered", "remaining"];

/**
 * What a head count is worth per person, once it is measured against the size
 * of the service. A coach of 40 changes every decision of the morning; forty
 * individuals change none of them.
 */
const WEIGHT: Record<string, number> = {
  groups: 3,
  expected: 2,
  children: 1.4,
  vip: 1,
  comp: 1,
};

/**
 * The metrics that fit, and which ones earn the spare slots.
 *
 * Seven pills across 320px is 45px each: under the touch minimum, and the
 * labels get cut. Four fit. Membership is not a fixed list — the outcome trio
 * leads, then the day decides, the same rule the report's tile row follows
 * (`tile-rank.ts`). A metric the day has none of is never shown: a zero
 * occupies a slot to say nothing.
 */
export function compactMetrics(all: MetricCandidate[], rooms: number, max = 4): string[] {
  const present = new Map(all.map((m) => [m.key, m.value]));
  const core = CORE.filter((k) => present.has(k));
  // Guard the empty house: scoring against zero rooms would be a division by
  // zero, and the ordering among the extras is all that matters here anyway.
  const scale = rooms > 0 ? rooms : 1;

  const extras = all
    .filter((m) => !CORE.includes(m.key) && m.value > 0)
    .map((m) => ({ key: m.key, score: (m.value / scale) * (WEIGHT[m.key] ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .map((m) => m.key);

  return [...core, ...extras].slice(0, max);
}
