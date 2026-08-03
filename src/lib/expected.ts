/**
 * "Attendus" — how many people we have good reason to expect this morning.
 *
 * This is a FACT, not a forecast, and the distinction is the whole design.
 * It answers one question with two pieces of recorded history: of the people
 * who actually came down to breakfast yesterday, how many are still in the
 * house today? Both halves are things that happened — a check-in we recorded,
 * and a reservation that has not ended. Nothing here models behaviour.
 *
 * A forecast (attendance rates, group multipliers, seasonality) is a different
 * feature with a different burden of proof; see US-10 in docs/USER-STORIES.md.
 * When there is no previous session this returns `basedOn: null` so the UI can
 * say "pas encore d'historique" instead of showing a confident zero.
 */

import type { Client, SessionRecord } from "./types";

export interface ExpectedToday {
  /** People in today's house who came down yesterday. */
  people: number;
  rooms: number;
  /** The date this was measured against, or null when there is none. */
  basedOn: string | null;
}

/** Names arrive as "DUPONT/MARIE", "Dupont, Marie", "  dupont marie  ". */
function nameKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function expectedFromYesterday(
  todayClients: Client[],
  history: SessionRecord[],
  todayIso: string
): ExpectedToday {
  const past = history
    .filter((s) => s.date && s.date < todayIso)
    .sort((a, b) => b.date.localeCompare(a.date));

  const last = past[0];
  if (!last) return { people: 0, rooms: 0, basedOn: null };

  // Who actually came down, by person. The room is deliberately not part of
  // the key: guests get moved overnight, and matching on the door number would
  // drop them the morning they change.
  const came = new Set(last.checkIns.map((c) => nameKey(c.clientName)));

  let people = 0;
  let rooms = 0;
  for (const c of todayClients) {
    if (!came.has(nameKey(c.name))) continue;
    rooms += 1;
    // Today's party size, not yesterday's — the reservation may have grown.
    people += (Number(c.adults) || 0) + (Number(c.children) || 0);
  }

  return { people, rooms, basedOn: last.date };
}
