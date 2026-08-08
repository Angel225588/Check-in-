/**
 * Where "back" goes.
 *
 * The check-in screen is reached from two places — the search screen during
 * service, and a row on the report afterwards — and a back button that always
 * returns to search sends you to the wrong screen half the time. Worse, it
 * loses your place: you were three quarters down a filtered report and now you
 * are at an empty keypad.
 *
 * The origin is recorded when the link is followed and read when back is
 * pressed. sessionStorage, not the URL: the same reason the room number is not
 * in the path — nothing about where reception has been needs to reach a server
 * log. It clears itself on read, so a reload does not resurrect a stale origin
 * from an hour ago.
 */

const KEY = "checkin-origin";

export type Origin = "search" | "report";

export function rememberOrigin(origin: Origin): void {
  try {
    sessionStorage.setItem(KEY, origin);
  } catch {
    /* private mode — fall back to the default destination */
  }
}

/**
 * The path back, defaulting to the search screen. Reading consumes it: the
 * next arrival has to declare its own origin rather than inheriting this one.
 */
export function takeOrigin(): string {
  let v: string | null = null;
  try {
    v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return v === "report" ? "/report" : "/search";
}

/** Read without consuming — for rendering the label before anyone taps. */
export function peekOrigin(): Origin {
  try {
    return sessionStorage.getItem(KEY) === "report" ? "report" : "search";
  } catch {
    return "search";
  }
}
