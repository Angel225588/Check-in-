/**
 * The retention window.
 *
 * One number, read from one place, so "how long do you keep guest data?" — the
 * question every hotel's compliance contact asks — has a single answer that
 * cannot drift between stores.
 *
 * NOTE ON THE DEFAULT. The app previously kept 30 days (a hardcoded
 * `RETENTION_DAYS` in storage.ts). 90 was specified for this work, so 90 is the
 * default here, but it is three times as much guest data on the device as
 * before. Shorter is strictly better for both minimisation and breach exposure:
 * setting `NEXT_PUBLIC_RETENTION_DAYS=30` restores the previous behaviour and
 * is the recommended production value. See docs/GDPR-AUDIT.md §3.
 */

export const RETENTION_DEFAULT_DAYS = 90;

/** Below this, a service that opened yesterday could vanish before it is
 *  reported on. */
export const RETENTION_MIN_DAYS = 1;

/** Above this, "retention" stops meaning anything. Roughly two years — long
 *  enough for any plausible accounting need, short of forever. */
export const RETENTION_MAX_DAYS = 730;

const SETTINGS_KEY = "privacy_retention_days";

function clamp(n: number): number {
  return Math.min(RETENTION_MAX_DAYS, Math.max(RETENTION_MIN_DAYS, Math.floor(n)));
}

function parse(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  // Junk must not silently mean "keep everything".
  return Number.isFinite(n) ? n : null;
}

/**
 * Runtime override, set by an operator. Wins over the environment so a property
 * can shorten its own window without a redeploy — never lengthen it past the cap.
 */
export function setRetentionDays(days: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, String(clamp(days)));
  } catch {
    /* quota — the env default still applies */
  }
}

export function getRetentionDays(): number {
  if (typeof localStorage !== "undefined") {
    try {
      const stored = parse(localStorage.getItem(SETTINGS_KEY));
      if (stored !== null) return clamp(stored);
    } catch {
      /* fall through to env */
    }
  }
  const env = parse(process.env.NEXT_PUBLIC_RETENTION_DAYS);
  return clamp(env ?? RETENTION_DEFAULT_DAYS);
}

/**
 * How long the audit trail is kept.
 *
 * Deliberately longer than the data. A log proving who read a guest's allergy
 * is worthless if it is deleted on the same schedule as the allergy — the
 * question "who accessed this?" is usually asked after the data is gone.
 */
export const ACCESS_LOG_RETENTION_DAYS = 365;

/** Longer again: the evidence that retention ran at all. */
export const PURGE_LOG_RETENTION_DAYS = 730;
