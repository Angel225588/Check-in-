import { DailyData, CheckInRecord, Client, SessionRecord, AppSettings, VipEntry } from "./types";
import { mergeVipIntoClients } from "./vip";
import { mergeNewClients, MergeResult } from "./merge";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function getKey(date: string): string {
  return `dailyData_${date}`;
}

const HISTORY_KEY = "sessionHistory";

// Keep at most this many days of closed sessions. Acts as a ring buffer:
// adding a new day past the cap drops the oldest, so storage never grows
// without bound day over day.
const MAX_HISTORY_DAYS = 30;

// --- Compression layer ---
// Guest lists and OCR text are highly repetitive, so LZ compression typically
// shrinks a day ~5-10x. This multiplies the ~5MB localStorage budget and is
// what keeps a busy shift from ever hitting the quota. The marker prefix lets
// reads transparently fall back to legacy UNCOMPRESSED JSON already sitting on
// existing devices — so upgrading a tablet never loses the day in progress.
const COMPRESSION_PREFIX = "LZ:";

function encode(value: unknown): string {
  return COMPRESSION_PREFIX + compressToUTF16(JSON.stringify(value));
}

/** Decode a stored string, handling both compressed and legacy plaintext. */
function decode<T>(raw: string): T | null {
  let json = raw;
  if (raw.startsWith(COMPRESSION_PREFIX)) {
    const d = decompressFromUTF16(raw.slice(COMPRESSION_PREFIX.length));
    if (d == null) return null;
    json = d;
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// --- Shape guards ---
// localStorage is trusted single-device data, but a corrupted or hand-edited
// entry must never crash the app on load. These coerce anything unexpected to
// a safe empty shape instead of letting `.reduce`/`.findIndex` throw.
function asDailyData(v: unknown, fallbackDate: string): DailyData | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.clients) || !Array.isArray(o.checkIns)) return null;
  return {
    date: typeof o.date === "string" ? o.date : fallbackDate,
    clients: o.clients as Client[],
    checkIns: o.checkIns as CheckInRecord[],
    rawUploadText: typeof o.rawUploadText === "string" ? o.rawUploadText : "",
  };
}

function asHistory(v: unknown): SessionRecord[] {
  return Array.isArray(v) ? (v as SessionRecord[]) : [];
}

// Upper bound on the accumulated OCR text we keep for a day. Every upload
// appends its full OCR blob to rawUploadText, and every check-in rewrites the
// whole day back to localStorage — left unbounded this is what eventually
// overflows the ~5MB quota mid-shift and makes saves start failing silently.
// We keep the most recent slice (newest uploads are the ones staff reference).
const MAX_RAW_UPLOAD_TEXT = 60_000;

function capRawUploadText(text: string): string {
  if (text.length <= MAX_RAW_UPLOAD_TEXT) return text;
  return text.slice(text.length - MAX_RAW_UPLOAD_TEXT);
}

/**
 * Reclaim localStorage space when a write hits QuotaExceededError, without
 * touching the day we're trying to save. Deletes always succeed even when the
 * store is full, so this frees room for a retry. Returns true if it freed
 * anything worth retrying for.
 */
function freeUpStorage(protectDate: string): boolean {
  if (typeof window === "undefined") return false;
  let freed = false;
  const today = getTodayString();

  // 1) Drop stale dailyData_* keys for past days (never the day being saved).
  const staleKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("dailyData_")) {
      const date = key.replace("dailyData_", "");
      if (date !== protectDate && date < today) staleKeys.push(key);
    }
  }
  for (const key of staleKeys) {
    localStorage.removeItem(key);
    freed = true;
  }

  // 2) Strip the heavy rawUploadText from stored session history and trim it.
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const history = asHistory(decode<SessionRecord[]>(raw));
      let changed = false;
      for (const s of history) {
        if (s.rawUploadText) {
          s.rawUploadText = "";
          changed = true;
        }
      }
      if (history.length > 15) {
        history.length = 15;
        changed = true;
      }
      if (changed) {
        // Rewriting a smaller value replaces the key in place; safe even full.
        localStorage.setItem(HISTORY_KEY, encode(history));
        freed = true;
      }
    }
  } catch {
    // History unreadable/unwritable — nothing more we can safely do here.
  }

  return freed;
}

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
  const today = getTodayString();
  const raw = localStorage.getItem(getKey(today));
  if (!raw) return null;
  return asDailyData(decode(raw), today);
}

export function getDataForDate(date: string): DailyData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(getKey(date));
  if (!raw) return null;
  return asDailyData(decode(raw), date);
}

export function saveTodayData(data: DailyData): boolean {
  data.date = getTodayString();
  const key = getKey(data.date);
  const serialized = encode(data);
  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    // QuotaExceededError — try to reclaim space from stale data, then retry
    // once. Only if the retry also fails do we report failure so the UI can
    // warn the user instead of showing a fake success.
    if (freeUpStorage(data.date)) {
      try {
        localStorage.setItem(key, serialized);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function saveClients(clients: Client[], rawText?: string): void {
  const existing = getTodayData();
  const data: DailyData = {
    date: getTodayString(),
    clients,
    checkIns: existing?.checkIns ?? [],
    rawUploadText: capRawUploadText(rawText || existing?.rawUploadText || ""),
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

  const combinedRaw = capRawUploadText(
    [existing?.rawUploadText, rawText].filter(Boolean).join("\n---\n")
  );

  const data: DailyData = {
    date: getTodayString(),
    clients: result.merged,
    checkIns: existing?.checkIns ?? [],
    rawUploadText: combinedRaw,
  };
  saveTodayData(data);
  return result;
}

export function saveRawUploadText(rawText: string): void {
  const data = getTodayData();
  if (!data) return;
  data.rawUploadText = capRawUploadText(rawText);
  saveTodayData(data);
}

export function addClient(client: Client): boolean {
  const data = getTodayData();
  if (!data) return false;
  // Live additions from /search default to walk-in source unless caller specified one.
  const tagged: Client = client.vipSource
    ? client
    : { ...client, vipSource: "walk_in" };
  data.clients.push(tagged);
  return saveTodayData(data);
}

export function updateClient(index: number, updates: Partial<Client>): boolean {
  const data = getTodayData();
  if (!data || !data.clients[index]) return false;
  data.clients[index] = { ...data.clients[index], ...updates };
  return saveTodayData(data);
}

/**
 * Persist a check-in. Returns true only if it was actually written to
 * localStorage — callers MUST check this and surface a failure instead of
 * showing a success state, otherwise a quota-full tablet silently loses guests.
 */
export function addCheckIn(record: CheckInRecord): boolean {
  const data = getTodayData();
  if (!data) return false;
  data.checkIns.push(record);
  return saveTodayData(data);
}

export function removeCheckIn(id: string): boolean {
  const data = getTodayData();
  if (!data) return false;
  const idx = data.checkIns.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  data.checkIns.splice(idx, 1);
  saveTodayData(data);
  return true;
}

export function getCheckInsForRoom(roomNumber: string): CheckInRecord[] {
  const data = getTodayData();
  if (!data) return [];
  return data.checkIns.filter((c) => c.roomNumber === roomNumber);
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
  return asHistory(decode<SessionRecord[]>(raw));
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
  if (history.length > MAX_HISTORY_DAYS) history.length = MAX_HISTORY_DAYS;

  // Try saving — if quota exceeded, trim rawUploadText and retry
  let saved = false;
  try {
    localStorage.setItem(HISTORY_KEY, encode(history));
    saved = true;
  } catch {
    // Quota exceeded — strip rawUploadText from older sessions to free space
    for (let i = history.length - 1; i >= 1; i--) {
      history[i].rawUploadText = "";
    }
    try {
      localStorage.setItem(HISTORY_KEY, encode(history));
      saved = true;
    } catch {
      // Still failing — reduce to 15 sessions
      if (history.length > 15) history.length = 15;
      try {
        localStorage.setItem(HISTORY_KEY, encode(history));
        saved = true;
      } catch {
        // Cannot save — do NOT clear daily data
      }
    }
  }

  // ONLY clear today's data if history was saved successfully
  if (saved) {
    clearDayData(data.date);
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
    // Shape-guarded decode: a corrupted/tampered entry must never throw here,
    // because autoCloseStale runs on every app load — an uncaught error would
    // white-screen the whole PWA at startup.
    const data = asDailyData(decode(raw), date);
    if (!data) {
      // Unreadable/malformed — drop it so it can't wedge startup.
      localStorage.removeItem(getKey(date));
      continue;
    }
    if (data.clients.length === 0) {
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
    if (history.length > MAX_HISTORY_DAYS) history.length = MAX_HISTORY_DAYS;

    let saved = false;
    try {
      localStorage.setItem(HISTORY_KEY, encode(history));
      saved = true;
    } catch {
      // Trim rawUploadText from older sessions
      for (let i = history.length - 1; i >= 1; i--) {
        history[i].rawUploadText = "";
      }
      try {
        localStorage.setItem(HISTORY_KEY, encode(history));
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
 * Merge two session records for the same date.
 * Combines clients (dedup by room+name) and check-ins (dedup by id).
 */
function mergeSessionRecords(existing: SessionRecord, incoming: SessionRecord): SessionRecord {
  // Merge clients: dedup by room + normalized name
  const clientKey = (c: Client) =>
    `${c.roomNumber}::${c.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
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
