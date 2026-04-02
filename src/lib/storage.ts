import { DailyData, CheckInRecord, Client, SessionRecord, AppSettings, VipEntry } from "./types";
import { mergeVipIntoClients } from "./vip";
import { mergeNewClients, MergeResult } from "./merge";

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
  if (typeof window === "undefined") {
    return { costPerCover: 26 };
  }
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { costPerCover: 26 };
  try {
    return JSON.parse(raw) as AppSettings;
  } catch {
    return { costPerCover: 26 };
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

export function saveTodayData(data: DailyData): void {
  data.date = getTodayString();
  try {
    localStorage.setItem(getKey(data.date), JSON.stringify(data));
  } catch {
    // QuotaExceededError — silently fail
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
  };
  saveTodayData(data);
  return result;
}

export function saveRawUploadText(rawText: string): void {
  const data = getTodayData();
  if (!data) return;
  data.rawUploadText = rawText;
  saveTodayData(data);
}

export function addClient(client: Client): void {
  const data = getTodayData();
  if (!data) return;
  data.clients.push(client);
  saveTodayData(data);
}

export function updateClient(index: number, updates: Partial<Client>): void {
  const data = getTodayData();
  if (!data || !data.clients[index]) return;
  data.clients[index] = { ...data.clients[index], ...updates };
  saveTodayData(data);
}

export function addCheckIn(record: CheckInRecord): void {
  const data = getTodayData();
  if (!data) return;
  data.checkIns.push(record);
  saveTodayData(data);
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
