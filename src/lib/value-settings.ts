/**
 * The three numbers the value report multiplies by, per hotel.
 *
 * Kept out of `AppSettings` deliberately. `app_settings` is reception's — hand
 * side, swipe, which metrics are on the bar — and it is written from the
 * check-in screen during service. These are the director's, they are argued
 * over in a meeting, and a stray write from the tablet must not touch them.
 *
 * Nothing here holds personal data, so it stays outside `SECURE_KEYS` and
 * outside `PURGEABLE_STORES`: a retention purge that wiped the hourly rate
 * would silently blank the euro column on the next report.
 */

import { getSettings } from "./storage";
import { DEFAULT_SECONDS_PER_COVER, type ValueAssumptions } from "./value-report";

export const VALUE_SETTINGS_KEY = "value_report_assumptions";

/** Breakfast price when the hotel has never set `costPerCover` either. */
const FALLBACK_BREAKFAST_PRICE = 26;

/**
 * A number we are willing to store.
 *
 * Zero passes — a hotel that gives breakfast away has a real price of zero, and
 * substituting a default there would invent revenue. Negative and non-finite
 * fail: they are a slipped keystroke, and one of them multiplied through every
 * figure on the page is exactly the kind of wrong number this report cannot
 * afford.
 */
function clean(v: unknown): number | null {
  // `Number(null)` is 0, and `Number("")` is 0. Left to coercion, an hourly
  // rate nobody had set would read back as a confident "0 €/h" and print a
  // measured-looking zero on the report. Unset has to stay unset.
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

interface StoredAssumptions {
  secondsPerCover?: number | null;
  hourlyRate?: number | null;
  breakfastPrice?: number | null;
  monthlyFee?: number | null;
}

function readStored(): StoredAssumptions {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(VALUE_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredAssumptions) : {};
  } catch {
    // Junk in storage must not take the report down; the defaults are honest.
    return {};
  }
}

/**
 * Seeded from `costPerCover`, which the hotel already maintains on the
 * dashboard, unless the report has been given its own price. Asking twice for
 * the same number is how two different answers end up on one page.
 */
function defaultBreakfastPrice(): number {
  try {
    const n = clean(getSettings().costPerCover);
    return n ?? FALLBACK_BREAKFAST_PRICE;
  } catch {
    return FALLBACK_BREAKFAST_PRICE;
  }
}

export function readAssumptions(): ValueAssumptions {
  const stored = readStored();
  return {
    secondsPerCover: clean(stored.secondsPerCover) ?? DEFAULT_SECONDS_PER_COVER,
    hourlyRate: clean(stored.hourlyRate),
    breakfastPrice: clean(stored.breakfastPrice) ?? defaultBreakfastPrice(),
    monthlyFee: clean(stored.monthlyFee),
  };
}

/**
 * Merge a change in. Partial on purpose: the report edits one field at a time,
 * inline, and a whole-object write from a single input is how the other three
 * get reset to whatever was on screen when it rendered.
 *
 * An explicit `null` clears a field back to unset — that is how a hotel takes
 * an hourly rate back off the report rather than being stuck with it.
 */
export function writeAssumptions(patch: Partial<ValueAssumptions>): void {
  if (typeof localStorage === "undefined") return;
  const next: StoredAssumptions = { ...readStored() };

  for (const key of ["secondsPerCover", "hourlyRate", "breakfastPrice", "monthlyFee"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    next[key] = value === null ? null : clean(value);
  }

  try {
    localStorage.setItem(VALUE_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* quota — the report falls back to defaults and says which they are */
  }
}
