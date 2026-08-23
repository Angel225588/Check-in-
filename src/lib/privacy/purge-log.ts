/**
 * Evidence that the retention purge actually ran.
 *
 * Two rules give this file its shape:
 *
 *  1. It records COUNTS AND DATES, never content. A purge log listing the
 *     guests it deleted would be a second copy of the data it just erased —
 *     the exact failure it exists to prevent.
 *  2. It outlives what it describes (PURGE_LOG_RETENTION_DAYS > the data
 *     window). Deleting the evidence on the same schedule as the data leaves
 *     you unable to answer "when was this removed?" precisely when asked.
 */
import { PURGE_LOG_RETENTION_DAYS } from "./config";

export const PURGE_LOG_KEY = "purge_log";

export interface PurgeLogEntry {
  id: string;
  ranAt: string;
  store: string;
  recordsRemoved: number;
  retentionDays: number;
  /** Date range of what went, for auditing. Dates are not personal data. */
  oldestRemoved: string;
  newestRemoved: string;
  triggerSource: "auto" | "manual" | "erasure-request";
}

/** Cap so a long-lived device cannot fill its quota with audit rows. */
const MAX_ENTRIES = 2000;

function read(): PurgeLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PURGE_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PurgeLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function getPurgeLog(): PurgeLogEntry[] {
  return read();
}

/** Drop log rows past the log's own (longer) window. */
function pruneLog(entries: PurgeLogEntry[], nowIso: string): PurgeLogEntry[] {
  const cutoff = Date.parse(nowIso) - PURGE_LOG_RETENTION_DAYS * 86_400_000;
  return entries.filter((e) => {
    const t = Date.parse(e.ranAt);
    return !Number.isFinite(t) || t >= cutoff;
  });
}

export function appendPurgeLog(entries: Omit<PurgeLogEntry, "id">[]): void {
  if (typeof localStorage === "undefined") return;
  // A run that removed nothing is noise; keeping it would bury the runs that did.
  const meaningful = entries.filter((e) => e.recordsRemoved > 0);
  if (meaningful.length === 0) return;

  const nowIso = new Date().toISOString();
  const withIds: PurgeLogEntry[] = meaningful.map((e, i) => ({
    ...e,
    id: `${Date.parse(e.ranAt) || Date.now()}-${e.store}-${i}`,
  }));

  const next = pruneLog([...read(), ...withIds], nowIso).slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(PURGE_LOG_KEY, JSON.stringify(next));
  } catch {
    // Quota. Halve and retry once rather than lose the trail entirely.
    try {
      localStorage.setItem(PURGE_LOG_KEY, JSON.stringify(next.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch {
      /* nothing further we can do without deleting the audit trail */
    }
  }
}
