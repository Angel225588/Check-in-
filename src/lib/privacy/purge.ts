/**
 * The retention purge.
 *
 * Covers every store that holds personal data. The list is exported and
 * asserted in tests so that adding a sixth store is a deliberate decision
 * rather than a silent gap — the previous gap was that three of five stores
 * (profiles, notes, morning briefs) were never purged at all.
 *
 * Runs on the device, because that is where the data is (see
 * docs/GDPR-AUDIT.md §0). The seam for a server-side job is `purgeExpired`
 * itself: give it a different set of store adapters and the policy is unchanged.
 */
import { getRetentionDays } from "./config";
import { appendPurgeLog } from "./purge-log";
import { NOTES_KEY_PREFIX } from "../notes-store";
import { envelopeTouchedAt } from "../note-envelope";
import { secureGet, secureSet, secureRemove, secureKeys } from "../secure-store";

export const PURGEABLE_STORES = [
  "sessionHistory",
  "dailyData",
  "morningBriefs",
  "guestProfiles",
  "notes",
] as const;

export type PurgeableStore = (typeof PURGEABLE_STORES)[number];

export interface StoreResult {
  store: PurgeableStore;
  recordsRemoved: number;
  oldestRemoved: string;
  newestRemoved: string;
}

export interface PurgeReport {
  ranAt: string;
  retentionDays: number;
  totalRemoved: number;
  byStore: StoreResult[];
}

export interface PurgeOptions {
  todayIso?: string;
  days?: number;
  triggerSource?: "auto" | "manual" | "erasure-request";
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Is `dateIso` outside the window?
 *
 * Junk dates return true: a record whose date cannot be parsed can never age
 * out on its own, so it would live forever — the opposite of retention.
 * Future dates return false: a tablet with a skewed clock still recorded a
 * real service, and deleting it is the worse error.
 */
function isExpired(dateIso: string, cutoffMs: number): boolean {
  const t = Date.parse(dateIso + (dateIso.length === 10 ? "T00:00:00Z" : ""));
  if (!Number.isFinite(t)) return true;
  return t < cutoffMs;
}

function track(removed: string[]): { oldestRemoved: string; newestRemoved: string } {
  const valid = removed.filter((d) => Number.isFinite(Date.parse(d))).sort();
  return { oldestRemoved: valid[0] ?? "", newestRemoved: valid[valid.length - 1] ?? "" };
}

/** Raw localStorage keys — used only for the note envelopes, which carry their
 *  own encryption and are not in the secure store. */
function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}

function purgeSessionHistory(cutoffMs: number): StoreResult {
  const removed: string[] = [];
  try {
    const raw = secureGet("sessionHistory");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const kept = list.filter((s: { date?: string }) => {
          const expired = isExpired(String(s?.date ?? ""), cutoffMs);
          if (expired) removed.push(String(s?.date ?? ""));
          return !expired;
        });
        if (removed.length > 0) secureSet("sessionHistory", JSON.stringify(kept));
      }
    }
  } catch {
    /* a corrupt history is handled by the app's own shape guards */
  }
  return { store: "sessionHistory", recordsRemoved: removed.length, ...track(removed) };
}

function purgeByDatedKey(
  store: PurgeableStore,
  prefix: string,
  cutoffMs: number
): StoreResult {
  const removed: string[] = [];
  for (const key of secureKeys(prefix)) {
    const date = key.slice(prefix.length);
    if (isExpired(date, cutoffMs)) {
      secureRemove(key);
      removed.push(date);
    }
  }
  return { store, recordsRemoved: removed.length, ...track(removed) };
}

/**
 * Profiles age on LAST contact, not first. A regular of ten years is current
 * data; a one-off from last spring is not. Using firstVisit would delete
 * exactly the guests the feature exists to recognise.
 */
function purgeGuestProfiles(cutoffMs: number): StoreResult {
  const removed: string[] = [];
  try {
    const raw = secureGet("guest_profiles");
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const kept = list.filter((g: { lastVisit?: string }) => {
          const expired = isExpired(String(g?.lastVisit ?? ""), cutoffMs);
          if (expired) removed.push(String(g?.lastVisit ?? ""));
          return !expired;
        });
        if (removed.length > 0) secureSet("guest_profiles", JSON.stringify(kept));
      }
    }
  } catch {
    /* corrupt profile store — leave it for the app's own guards */
  }
  return { store: "guestProfiles", recordsRemoved: removed.length, ...track(removed) };
}

/**
 * Notes are encrypted, so their age cannot be read without decrypting each
 * one. Rather than decrypt the whole store on every app load, each envelope
 * carries a plaintext `touchedAt` — a date, which is not personal data, beside
 * ciphertext that is. An envelope written before that field existed has no
 * date and is kept: deleting an allergy because of a storage-format upgrade is
 * the worst possible outcome here.
 */
function purgeNotes(cutoffMs: number): StoreResult {
  const removed: string[] = [];
  for (const key of keysWithPrefix(NOTES_KEY_PREFIX)) {
    if (key === `${NOTES_KEY_PREFIX}salt`) continue; // the salt is not guest data
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const touchedAt = envelopeTouchedAt(raw);
      if (!touchedAt) continue;
      if (isExpired(touchedAt, cutoffMs)) {
        localStorage.removeItem(key);
        removed.push(touchedAt.split("T")[0]);
      }
    } catch {
      /* not JSON, or not ours — leave it alone */
    }
  }
  return { store: "notes", recordsRemoved: removed.length, ...track(removed) };
}

export async function purgeExpired(options: PurgeOptions = {}): Promise<PurgeReport> {
  const days = options.days ?? getRetentionDays();
  const todayIso = options.todayIso ?? todayString();
  const ranAt = new Date().toISOString();

  const empty: PurgeReport = { ranAt, retentionDays: days, totalRemoved: 0, byStore: [] };
  if (typeof localStorage === "undefined") return empty;

  const cutoffMs = Date.parse(todayIso + "T00:00:00Z") - days * 86_400_000;
  if (!Number.isFinite(cutoffMs)) return empty;

  const byStore: StoreResult[] = [
    purgeSessionHistory(cutoffMs),
    purgeByDatedKey("dailyData", "dailyData_", cutoffMs),
    purgeByDatedKey("morningBriefs", "morningBrief_", cutoffMs),
    purgeGuestProfiles(cutoffMs),
    purgeNotes(cutoffMs),
  ];

  const totalRemoved = byStore.reduce((n, s) => n + s.recordsRemoved, 0);

  appendPurgeLog(
    byStore.map((s) => ({
      ranAt,
      store: s.store,
      recordsRemoved: s.recordsRemoved,
      retentionDays: days,
      oldestRemoved: s.oldestRemoved,
      newestRemoved: s.newestRemoved,
      triggerSource: options.triggerSource ?? "auto",
    }))
  );

  return { ranAt, retentionDays: days, totalRemoved, byStore };
}
