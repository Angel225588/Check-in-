/**
 * Check-in navigation without guest PII in the URL.
 *
 * The room number is sensitive (it locates a specific guest), and Vercel logs
 * every request path — including the RSC fetches App Router fires on client
 * navigation. So we never put the room number in the path. Instead we stash the
 * selection in sessionStorage under a random, meaningless token and navigate to
 * `/checkin/<token>`. Logs then only ever see the opaque token.
 *
 * sessionStorage survives reloads within the same tab, so refreshing the
 * check-in screen still resolves the guest. It clears when the tab closes.
 */

export interface CheckinSelection {
  roomNumber: string;
  ci?: number;
  /** How many of the room are walking in, chosen on the search screen. */
  count?: number;
}

const KEY_PREFIX = "checkin_sel_";

function makeToken(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // fall through
  }
  // Non-crypto fallback: only a lookup key, not a security token.
  return (
    Date.now().toString(36).slice(-4) +
    Math.floor(Math.random() * 1e6).toString(36)
  );
}

/** Store a selection and return the opaque token to route with. */
export function stashSelection(sel: CheckinSelection): string {
  const token = makeToken();
  try {
    sessionStorage.setItem(KEY_PREFIX + token, JSON.stringify(sel));
  } catch {
    // sessionStorage unavailable/full — navigation still works via the
    // room-number fallback in the check-in page (older/legacy path).
  }
  return token;
}

/** Resolve a token back to its selection, or null if unknown/malformed. */
export function readSelection(token: string): CheckinSelection | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + token);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      if (typeof rec.roomNumber === "string") {
        // A count that is not a positive whole number is dropped, not clamped:
        // the check-in screen's own default is the safer answer than a guess.
        const n = rec.count;
        const count =
          typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
        return {
          roomNumber: rec.roomNumber,
          ci: typeof rec.ci === "number" ? rec.ci : undefined,
          count,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Build a PII-free check-in href for a selected room/guest. */
export function checkinHref(roomNumber: string, ci?: number, count?: number): string {
  const token = stashSelection({ roomNumber, ci, count });
  return `/checkin/${token}`;
}
