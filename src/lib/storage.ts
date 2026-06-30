import { DailyData, CheckInRecord, Client, SessionRecord, AppSettings, VipEntry } from "./types";
import { mergeVipIntoClients } from "./vip";
import { mergeNewClients, MergeResult, clientKey } from "./merge";
import { SYNC_ENABLED } from "./sync/config";
import { hasPendingForDate } from "./sync/outbox";
import {
  stampClient,
  stampCheckin,
  onClientUpsert,
  onCheckinUpsert,
  onCheckinDelete,
  onSessionUpsert,
} from "./sync/hooks";

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function getKey(date: string): string {
  return `dailyData_${date}`;
}

const HISTORY_KEY = "sessionHistory";

// --- Settings ---

const SETTINGS_KEY = "app_settings";

export function getSettings(): AppSettings {
  const defaults: AppSettings = { costPerCover: 26, localOCR: false };
  if (typeof window === "undefined") return defaults;
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) } as AppSettings;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// --- Daily Data ---

export function getTodayData(): DailyData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(getKey(getTodayString()));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyData;
  } catch {
    return null;
  }
}

export function getDataForDate(date: string): DailyData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(getKey(date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyData;
  } catch {
    return null;
  }
}

export function saveTodayData(data: DailyData): boolean {
  data.date = getTodayString();
  try {
    localStorage.setItem(getKey(data.date), JSON.stringify(data));
    return true;
  } catch {
    // QuotaExceededError — return false so UI can warn user
    return false;
  }
}

export function saveClients(clients: Client[], rawText?: string): void {
  const existing = getTodayData();
  const data: DailyData = {
    date: getTodayString(),
    clients,
    checkIns: existing?.checkIns ?? [],
    rawUploadText: rawText || existing?.rawUploadText || "",
  };
  saveTodayData(data);
}

/**
 * Merge new clients into today's existing data instead of replacing.
 * Returns merge stats so UI can show a summary.
 */
export function saveClientsMerged(newClients: Client[], rawText?: string): MergeResult {
  const existing = getTodayData();
  const existingClients = existing?.clients ?? [];
  const result = mergeNewClients(existingClients, newClients);

  const combinedRaw = [existing?.rawUploadText, rawText]
    .filter(Boolean)
    .join("\n---\n");

  const data: DailyData = {
    date: getTodayString(),
    clients: result.merged,
    checkIns: existing?.checkIns ?? [],
    rawUploadText: combinedRaw,
    id: existing?.id,
    sessionRev: existing?.sessionRev,
    serverUpdatedAt: existing?.serverUpdatedAt,
  };
  const fresh: Client[] = [];
  if (SYNC_ENABLED) {
    for (const c of data.clients) if (!c.id) { stampClient(c); fresh.push(c); }
  }
  saveTodayData(data);
  if (SYNC_ENABLED) {
    for (const c of fresh) onClientUpsert(c, data.date, data.id);
    onSessionUpsert(data, {});
  }
  return result;
}

export function saveRawUploadText(rawText: string): void {
  const data = getTodayData();
  if (!data) return;
  data.rawUploadText = rawText;
  saveTodayData(data);
}

/**
 * Data minimization: drop the raw OCR text for the OPEN day once the clean roster
 * is saved. The clean structured data + the hotel's own report are the sources of
 * truth — we don't retain the unstructured guest dump. Photos are never persisted;
 * this raw text is the only PII blob that would otherwise linger. Safe + idempotent.
 */
export function dropTodayRawText(): void {
  const data = getTodayData();
  if (!data || !data.rawUploadText) return;
  data.rawUploadText = "";
  saveTodayData(data);
}

export function addClient(client: Client): void {
  const data = getTodayData();
  if (!data) return;
  // Live additions from /search default to walk-in source unless caller specified one.
  const tagged: Client = client.vipSource
    ? client
    : { ...client, vipSource: "walk_in" };
  if (SYNC_ENABLED) stampClient(tagged);
  data.clients.push(tagged);
  saveTodayData(data);
  onClientUpsert(tagged, data.date, data.id);
}

export function updateClient(index: number, updates: Partial<Client>): void {
  const data = getTodayData();
  if (!data || !data.clients[index]) return;
  const updated = { ...data.clients[index], ...updates };
  if (SYNC_ENABLED) stampClient(updated);
  data.clients[index] = updated;
  saveTodayData(data);
  onClientUpsert(updated, data.date, data.id, Object.keys(updates));
}

export function addCheckIn(record: CheckInRecord): void {
  const data = getTodayData();
  if (!data) return;
  if (SYNC_ENABLED) stampCheckin(record);
  data.checkIns.push(record);
  saveTodayData(data);
  onCheckinUpsert(record, data.date, data.id);
}

export function removeCheckIn(id: string): boolean {
  const data = getTodayData();
  if (!data) return false;
  const idx = data.checkIns.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  const [rec] = data.checkIns.splice(idx, 1);
  addCheckInTombstone(id); // Sync v2: a concurrent server pull must not resurrect it
  saveTodayData(data);
  if (SYNC_ENABLED) {
    stampCheckin(rec);
    onCheckinDelete(rec, data.date); // syncs a tombstone; pull won't resurrect (pending guard)
  }
  return true;
}

export function getCheckInsForRoom(roomNumber: string): CheckInRecord[] {
  const data = getTodayData();
  if (!data) return [];
  return data.checkIns.filter((c) => c.roomNumber === roomNumber);
}

// --- Cross-device check-in reconcile (Sync v2) ---
// Check-in records are immutable once created; the only mutation is undo. So the
// reconcile is purely additive (add records other devices created) + tombstone-
// driven removal (a record undone on any device disappears everywhere). No LWW.

const CHECKIN_TOMBSTONE_KEY = "imk_checkin_tombstones";

/** Ids this device has undone — kept so a pull that still sees them live can't resurrect them. */
export function checkInTombstones(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(CHECKIN_TOMBSTONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCheckInTombstones(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHECKIN_TOMBSTONE_KEY, JSON.stringify([...set]));
  } catch {
    /* best-effort: a missed tombstone only risks a transient re-appear, healed next pull */
  }
}

export function addCheckInTombstone(id: string): void {
  const set = checkInTombstones();
  set.add(id);
  writeCheckInTombstones(set);
}

export function clearCheckInTombstones(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHECKIN_TOMBSTONE_KEY);
}

/**
 * Reconcile server check-ins into today's local session (Sync v2).
 * - Adds any live server record not present locally → device B sees device A's check-in,
 *   so its remaining/allDone reflects reality and the existing guard blocks a duplicate.
 * - Removes any record the server tombstoned → undo propagates across devices.
 * - Never resurrects a record THIS device just undid (local tombstone wins until its own
 *   tombstone push lands). Pass already-decrypted records; this layer stays crypto-free.
 */
export function applyServerCheckins(live: CheckInRecord[], deletedIds: string[]): void {
  const data = getTodayData();
  if (!data) return;
  const tombstones = checkInTombstones();
  const byId = new Map<string, CheckInRecord>();
  for (const ci of data.checkIns) byId.set(ci.id, ci);

  const deleted = new Set(deletedIds);
  for (const id of deleted) {
    byId.delete(id);
    tombstones.add(id); // remember it so a later live pull can't bring it back
  }
  for (const rec of live) {
    if (tombstones.has(rec.id) || deleted.has(rec.id)) continue;
    if (!byId.has(rec.id)) byId.set(rec.id, rec);
  }

  saveTodayData({ ...data, checkIns: Array.from(byId.values()) });
  writeCheckInTombstones(tombstones);
}

export function clearDayData(date: string): void {
  localStorage.removeItem(getKey(date));
}

// --- Mid-session VIP merge ---

export function mergeVipIntoSession(vipClients: Client[]): Client[] {
  const data = getTodayData();
  if (!data) return vipClients;

  const vipEntries: VipEntry[] = vipClients.map((c) => ({
    roomNumber: c.roomNumber,
    name: c.name,
    vipLevel: c.vipLevel || "",
    vipNotes: c.vipNotes || "",
    confirmationNumber: c.confirmationNumber,
    arrivalDate: c.arrivalDate,
    departureDate: c.departureDate,
    roomType: c.roomType,
    adults: c.adults,
    children: c.children,
    rateCode: c.rateCode,
  }));

  const merged = mergeVipIntoClients(data.clients, vipEntries);
  saveTodayData({ ...data, clients: merged });
  return merged;
}

// --- Session history ---

export function getSessionHistory(): SessionRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}

export function closeDay(): SessionRecord | null {
  const data = getTodayData();
  if (!data) return null;

  const totalGuests = data.clients.reduce(
    (s, c) => s + c.adults + c.children,
    0
  );
  const totalEntered = data.checkIns.reduce(
    (s, c) => s + c.peopleEntered,
    0
  );

  const record: SessionRecord = {
    date: data.date,
    closedAt: new Date().toISOString(),
    totalRooms: data.clients.length,
    totalGuests,
    totalEntered,
    totalRemaining: Math.max(0, totalGuests - totalEntered),
    totalVip: data.clients.filter((c) => c.isVip).length,
    clients: data.clients,
    checkIns: data.checkIns,
    rawUploadText: data.rawUploadText,
  };

  // Save to history — merge if same date already exists
  const history = getSessionHistory();
  const existingIdx = history.findIndex((s) => s.date === record.date);
  if (existingIdx !== -1) {
    history[existingIdx] = mergeSessionRecords(history[existingIdx], record);
  } else {
    history.unshift(record);
  }
  if (history.length > 30) history.length = 30;

  // Try saving — if quota exceeded, trim rawUploadText and retry
  let saved = false;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    saved = true;
  } catch {
    // Quota exceeded — strip rawUploadText from older sessions to free space
    for (let i = history.length - 1; i >= 1; i--) {
      history[i].rawUploadText = "";
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      saved = true;
    } catch {
      // Still failing — reduce to 15 sessions
      if (history.length > 15) history.length = 15;
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        saved = true;
      } catch {
        // Cannot save — do NOT clear daily data
      }
    }
  }

  if (SYNC_ENABLED) {
    onSessionUpsert(data, { status: "closed", closedAt: record.closedAt });
  }

  // ONLY clear today's data if history was saved successfully
  if (saved) {
    // When sync is on, keep the day until its outbox is drained (never lose unsynced writes).
    if (!(SYNC_ENABLED && hasPendingForDate(data.date))) {
      clearDayData(data.date);
      clearCheckInTombstones(); // day is done — tombstone set no longer needed
    }
  }

  return record;
}

/**
 * Auto-close any dailyData_* sessions from previous days.
 * Called on app load to prevent orphaned sessions.
 * Returns the number of sessions auto-closed.
 */
export function autoCloseStale(): number {
  if (typeof window === "undefined") return 0;
  const today = getTodayString();
  let closed = 0;

  // Find all dailyData keys for dates before today
  const staleKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("dailyData_")) {
      const date = key.replace("dailyData_", "");
      if (date < today) {
        staleKeys.push(date);
      }
    }
  }

  for (const date of staleKeys) {
    const raw = localStorage.getItem(getKey(date));
    if (!raw) continue;
    let data: DailyData;
    try {
      data = JSON.parse(raw) as DailyData;
    } catch {
      continue;
    }
    if (!data.clients || data.clients.length === 0) {
      // Empty session — just remove it
      localStorage.removeItem(getKey(date));
      continue;
    }

    const totalGuests = data.clients.reduce((s, c) => s + c.adults + c.children, 0);
    const totalEntered = data.checkIns.reduce((s, c) => s + c.peopleEntered, 0);

    const record: SessionRecord = {
      date: data.date || date,
      closedAt: new Date().toISOString(),
      totalRooms: data.clients.length,
      totalGuests,
      totalEntered,
      totalRemaining: Math.max(0, totalGuests - totalEntered),
      totalVip: data.clients.filter((c) => c.isVip).length,
      clients: data.clients,
      checkIns: data.checkIns,
      rawUploadText: data.rawUploadText,
    };

    const history = getSessionHistory();
    // Check if this date already has a session — merge if so
    const existingIdx = history.findIndex((s) => s.date === record.date);
    if (existingIdx !== -1) {
      history[existingIdx] = mergeSessionRecords(history[existingIdx], record);
    } else {
      history.unshift(record);
    }
    // Sort by date descending
    history.sort((a, b) => b.date.localeCompare(a.date));
    if (history.length > 30) history.length = 30;

    let saved = false;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      saved = true;
    } catch {
      // Trim rawUploadText from older sessions
      for (let i = history.length - 1; i >= 1; i--) {
        history[i].rawUploadText = "";
      }
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        saved = true;
      } catch {
        // Cannot save — leave daily data intact
      }
    }

    if (saved) {
      localStorage.removeItem(getKey(date));
      closed++;
    }
  }

  return closed;
}

/**
 * S0 — proactive storage hygiene. Clears the raw OCR text (`rawUploadText`)
 * from all CLOSED sessions in history; it's only needed to re-parse the OPEN
 * day, never a past one. Photos are never persisted, so this raw text is the
 * only thing that grows storage over time. Returns the chars freed.
 * Safe, idempotent, best-effort (swallows quota errors). Call on app load.
 */
export function purgeStaleRawText(): number {
  if (typeof window === "undefined") return 0;
  const history = getSessionHistory();
  let freed = 0;
  let changed = false;
  for (const s of history) {
    if (s.rawUploadText) {
      freed += s.rawUploadText.length;
      s.rawUploadText = "";
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // best-effort: leave history intact on quota error
    }
  }
  return freed;
}

/**
 * Merge two session records for the same date.
 * Combines clients (dedup by room+name) and check-ins (dedup by id).
 */
export function mergeSessionRecords(existing: SessionRecord, incoming: SessionRecord): SessionRecord {
  // Merge clients: dedup by room + normalized name (unified normalizer from merge.ts)
  const clientMap = new Map<string, Client>();
  for (const c of existing.clients) clientMap.set(clientKey(c), c);
  for (const c of incoming.clients) {
    const key = clientKey(c);
    if (!clientMap.has(key)) clientMap.set(key, c);
  }
  const mergedClients = Array.from(clientMap.values());

  // Merge check-ins: dedup by id
  const checkInMap = new Map<string, CheckInRecord>();
  for (const ci of existing.checkIns) checkInMap.set(ci.id, ci);
  for (const ci of incoming.checkIns) checkInMap.set(ci.id, ci);
  const mergedCheckIns = Array.from(checkInMap.values());

  const totalGuests = mergedClients.reduce((s, c) => s + c.adults + c.children, 0);
  const totalEntered = mergedCheckIns.reduce((s, c) => s + c.peopleEntered, 0);

  return {
    date: existing.date,
    closedAt: incoming.closedAt || existing.closedAt,
    totalRooms: mergedClients.length,
    totalGuests,
    totalEntered,
    totalRemaining: Math.max(0, totalGuests - totalEntered),
    totalVip: mergedClients.filter((c) => c.isVip).length,
    clients: mergedClients,
    checkIns: mergedCheckIns,
    rawUploadText: [existing.rawUploadText, incoming.rawUploadText].filter(Boolean).join("\n---\n"),
  };
}

// --- Client History ---

export function getClientHistory(
  roomNumber: string,
  clientName: string
): { date: string; checkIns: CheckInRecord[] }[] {
  const sessions = getSessionHistory();
  const normName = clientName.trim().toLowerCase().replace(/\s+/g, " ");
  const today = getTodayString();

  // Group check-ins by date to deduplicate sessions on the same day
  const byDate = new Map<string, CheckInRecord[]>();

  for (const s of sessions) {
    // Skip today — today's check-ins are shown separately via todayCheckIns prop
    if (s.date === today) continue;

    const matching = s.checkIns.filter(
      (ci) =>
        ci.roomNumber === roomNumber &&
        ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
    );
    if (matching.length > 0) {
      const existing = byDate.get(s.date) ?? [];
      byDate.set(s.date, existing.concat(matching));
    }
  }

  // Convert map to sorted array (most recent first)
  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, checkIns]) => ({ date, checkIns }));
}

// --- Historical Data (for dashboard) ---

// Build a lookup of closed sessions by date
function getSessionsByDate(): Map<string, DailyData> {
  const sessions = getSessionHistory();
  const map = new Map<string, DailyData>();
  for (const s of sessions) {
    // Convert SessionRecord → DailyData so dashboard can use it
    if (!map.has(s.date)) {
      map.set(s.date, {
        date: s.date,
        clients: s.clients,
        checkIns: s.checkIns,
        rawUploadText: s.rawUploadText,
      });
    }
  }
  return map;
}

// Get data for a date: active day first, then fall back to closed session
function getDataForDateOrSession(
  dateStr: string,
  sessionMap: Map<string, DailyData>
): DailyData | null {
  return getDataForDate(dateStr) || sessionMap.get(dateStr) || null;
}

// Get data for the last N days (including today)
export function getHistoricalData(days: number): DailyData[] {
  if (typeof window === "undefined") return [];
  const sessionMap = getSessionsByDate();
  const result: DailyData[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const data = getDataForDateOrSession(dateStr, sessionMap);
    if (data) {
      result.push(data);
    }
  }

  return result;
}

// Get data for a custom date range
export function getDataForRange(startDate: string, endDate: string): DailyData[] {
  if (typeof window === "undefined") return [];
  const sessionMap = getSessionsByDate();
  const result: DailyData[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const data = getDataForDateOrSession(dateStr, sessionMap);
    if (data) {
      result.push(data);
    }
  }

  return result;
}

// Get all dates that have data stored (for client search)
export function getAllStoredDates(): string[] {
  if (typeof window === "undefined") return [];
  const dates: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("dailyData_")) {
      dates.push(key.replace("dailyData_", ""));
    }
  }
  return dates.sort().reverse();
}
