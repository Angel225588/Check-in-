/**
 * Data-subject rights: export and erasure, for one guest and for a whole
 * property.
 *
 * As a processor the app does not decide whether to honour a request — the
 * hotel does. What it must be able to do is CARRY OUT that decision completely
 * and provably (Art. 28(3)(e) and 28(3)(g)). "Completely" is the hard part:
 * guest data is spread across five stores, and an erasure that misses one is
 * not an erasure.
 *
 * Two things deliberately survive an erasure:
 *   - the access log, which holds a salted hash and never a name, and
 *   - the purge log, which holds counts and dates.
 * Both are the evidence that the erasure happened. Deleting them alongside the
 * data would leave the hotel unable to demonstrate compliance — the opposite of
 * Art. 5(2) — while deleting nothing a data subject could recognise as theirs.
 */
import { guestIdentity } from "../guest-identity";
import { guestKey, loadNotes, NOTES_KEY_PREFIX } from "../notes-store";
import type { GuestNote } from "../notes";
import type { Client, CheckInRecord, DailyData, SessionRecord } from "../types";
import type { GuestProfile } from "../guests";
import { getRetentionDays } from "./config";
import { appendPurgeLog } from "./purge-log";
import { recordAccess, getAccessLogForGuest, type AccessLogEntry } from "./access-log";
import { secureGet, secureSet, secureRemove, secureKeys } from "../secure-store";

export interface ActorOptions {
  /** Who is carrying out the request — recorded in the access log. */
  actor: string;
}

export interface GuestExport {
  guest: { displayName: string; identity: string };
  meta: { exportedAt: string; retentionDays: number };
  clients: { date: string; client: Client }[];
  checkIns: { date: string; checkIn: CheckInRecord }[];
  profile: GuestProfile | null;
  notes: GuestNote[];
  accessLog: AccessLogEntry[];
}

export interface PropertyExport {
  meta: { exportedAt: string; retentionDays: number; storageModel: "device-local" };
  days: DailyData[];
  sessionHistory: SessionRecord[];
  guestProfiles: GuestProfile[];
  notes: { subjectKey: string; notes: GuestNote[] }[];
}

export interface ErasureReport {
  erasedAt: string;
  recordsRemoved: number;
  stores: string[];
}

/** Raw localStorage keys — only the note envelopes, which are separately
 *  encrypted and live outside the secure store. */
function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) out.push(k);
  }
  return out;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = secureGet(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Same-person matching, using the app's single definition of identity so a
 *  request for "Dupont Marie" reaches rows printed "DUPONT, MARIE". */
function isSameGuest(a: string, b: string): boolean {
  const x = guestIdentity(a);
  const y = guestIdentity(b);
  return !!x && !!y && x === y;
}

// ---------------------------------------------------------------- export ----

export async function exportGuest(name: string, opts: ActorOptions): Promise<GuestExport> {
  const identity = guestIdentity(name) ?? "";
  const clients: { date: string; client: Client }[] = [];
  const checkIns: { date: string; checkIn: CheckInRecord }[] = [];

  const collect = (date: string, data: { clients?: Client[]; checkIns?: CheckInRecord[] }) => {
    for (const c of data.clients ?? []) if (isSameGuest(c.name, name)) clients.push({ date, client: c });
    for (const ci of data.checkIns ?? []) if (isSameGuest(ci.clientName, name)) checkIns.push({ date, checkIn: ci });
  };

  for (const key of secureKeys("dailyData_")) {
    const date = key.slice("dailyData_".length);
    collect(date, readJson(key, {} as DailyData));
  }
  for (const s of readJson<SessionRecord[]>("sessionHistory", [])) {
    collect(s.date, s);
  }

  const profile =
    readJson<GuestProfile[]>("guest_profiles", []).find((p) => isSameGuest(p.name, name)) ?? null;

  let notes: GuestNote[] = [];
  try {
    notes = await loadNotes(name);
  } catch {
    /* a guest with no usable name has no notes */
  }

  const accessLog = await getAccessLogForGuest(name);

  // An export is itself an access to the guest's data, and is logged as one.
  await recordAccess({
    actor: opts.actor, action: "export", resource: "subject-export",
    guestName: name, detail: { records: clients.length + checkIns.length + notes.length },
  });

  return {
    guest: { displayName: name, identity },
    meta: { exportedAt: new Date().toISOString(), retentionDays: getRetentionDays() },
    clients, checkIns, profile, notes, accessLog,
  };
}

export async function exportProperty(opts: ActorOptions): Promise<PropertyExport> {
  const days: DailyData[] = [];
  for (const key of secureKeys("dailyData_")) {
    const d = readJson<DailyData | null>(key, null);
    if (d) days.push(d);
  }

  const guestProfiles = readJson<GuestProfile[]>("guest_profiles", []);

  // Notes are keyed by an opaque hash. Resolve what we can through the profiles
  // we hold; an orphaned envelope is still exported under its key so the export
  // is complete even where the name is no longer known.
  const notes: { subjectKey: string; notes: GuestNote[] }[] = [];
  const seen = new Set<string>();
  for (const p of guestProfiles) {
    try {
      const k = await guestKey(p.name);
      seen.add(NOTES_KEY_PREFIX + k);
      const n = await loadNotes(p.name);
      if (n.length) notes.push({ subjectKey: k, notes: n });
    } catch {
      /* unusable name — nothing to resolve */
    }
  }
  for (const key of keysWithPrefix(NOTES_KEY_PREFIX)) {
    if (key === `${NOTES_KEY_PREFIX}salt` || seen.has(key)) continue;
    notes.push({ subjectKey: key.slice(NOTES_KEY_PREFIX.length), notes: [] });
  }

  await recordAccess({
    actor: opts.actor, action: "export", resource: "property-export",
    detail: { days: days.length, profiles: guestProfiles.length },
  });

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      retentionDays: getRetentionDays(),
      storageModel: "device-local",
    },
    days,
    sessionHistory: readJson<SessionRecord[]>("sessionHistory", []),
    guestProfiles,
    notes,
  };
}

// --------------------------------------------------------------- erasure ----

export async function eraseGuest(name: string, opts: ActorOptions): Promise<ErasureReport> {
  const erasedAt = new Date().toISOString();
  const stores: string[] = [];
  let removed = 0;

  // Live days
  for (const key of secureKeys("dailyData_")) {
    const data = readJson<DailyData | null>(key, null);
    if (!data) continue;
    const clients = (data.clients ?? []).filter((c) => !isSameGuest(c.name, name));
    const checkIns = (data.checkIns ?? []).filter((ci) => !isSameGuest(ci.clientName, name));
    const discrepancies = (data.discrepancies ?? []).filter((d) => !isSameGuest(d.clientName, name));
    const n =
      (data.clients?.length ?? 0) - clients.length +
      (data.checkIns?.length ?? 0) - checkIns.length +
      (data.discrepancies?.length ?? 0) - discrepancies.length;
    if (n > 0) {
      secureSet(key, JSON.stringify({ ...data, clients, checkIns, discrepancies }));
      removed += n;
      if (!stores.includes("dailyData")) stores.push("dailyData");
    }
  }

  // Closed sessions
  const history = readJson<SessionRecord[]>("sessionHistory", []);
  let historyRemoved = 0;
  const nextHistory = history.map((s) => {
    const clients = (s.clients ?? []).filter((c) => !isSameGuest(c.name, name));
    const checkIns = (s.checkIns ?? []).filter((ci) => !isSameGuest(ci.clientName, name));
    historyRemoved += (s.clients?.length ?? 0) - clients.length +
                      (s.checkIns?.length ?? 0) - checkIns.length;
    return { ...s, clients, checkIns };
  });
  if (historyRemoved > 0) {
    secureSet("sessionHistory", JSON.stringify(nextHistory));
    removed += historyRemoved;
    stores.push("sessionHistory");
  }

  // Profile
  const profiles = readJson<GuestProfile[]>("guest_profiles", []);
  const keptProfiles = profiles.filter((p) => !isSameGuest(p.name, name));
  if (keptProfiles.length !== profiles.length) {
    secureSet("guest_profiles", JSON.stringify(keptProfiles));
    removed += profiles.length - keptProfiles.length;
    stores.push("guestProfiles");
  }

  // Notes
  try {
    const key = NOTES_KEY_PREFIX + (await guestKey(name));
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      removed += 1;
      stores.push("notes");
    }
  } catch {
    /* no usable identity — no note envelope to remove */
  }

  // Evidence. The access log keeps a hash, never a name, so it survives.
  appendPurgeLog(stores.map((store) => ({
    ranAt: erasedAt, store, recordsRemoved: removed, retentionDays: getRetentionDays(),
    oldestRemoved: "", newestRemoved: "", triggerSource: "erasure-request" as const,
  })));

  await recordAccess({
    actor: opts.actor, action: "erase", resource: "subject-erasure",
    guestName: name, detail: { recordsRemoved: removed, stores },
  });

  return { erasedAt, recordsRemoved: removed, stores };
}

export async function eraseProperty(opts: ActorOptions): Promise<ErasureReport> {
  const erasedAt = new Date().toISOString();
  const stores: string[] = [];
  let removed = 0;

  const dropSecure = (prefix: string, store: string) => {
    const keys = secureKeys(prefix);
    for (const k of keys) secureRemove(k);
    if (keys.length) { removed += keys.length; stores.push(store); }
  };
  const dropNotes = () => {
    // Notes live outside the secure store — they carry their own envelope.
    const keys = keysWithPrefix(NOTES_KEY_PREFIX).filter((k) => k !== `${NOTES_KEY_PREFIX}salt`);
    for (const k of keys) localStorage.removeItem(k);
    if (keys.length) { removed += keys.length; stores.push("notes"); }
  };

  dropSecure("dailyData_", "dailyData");
  dropSecure("morningBrief_", "morningBriefs");
  dropNotes();

  const history = readJson<SessionRecord[]>("sessionHistory", []);
  if (history.length) {
    secureSet("sessionHistory", "[]");
    removed += history.length;
    stores.push("sessionHistory");
  }

  const profiles = readJson<GuestProfile[]>("guest_profiles", []);
  if (profiles.length) {
    secureSet("guest_profiles", "[]");
    removed += profiles.length;
    stores.push("guestProfiles");
  }

  appendPurgeLog(stores.map((store) => ({
    ranAt: erasedAt, store, recordsRemoved: removed, retentionDays: getRetentionDays(),
    oldestRemoved: "", newestRemoved: "", triggerSource: "erasure-request" as const,
  })));

  await recordAccess({
    actor: opts.actor, action: "erase", resource: "property-erasure",
    detail: { recordsRemoved: removed, stores },
  });

  return { erasedAt, recordsRemoved: removed, stores };
}
