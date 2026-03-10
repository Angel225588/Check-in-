import { DailyData, CheckInRecord, Client, SessionRecord, AppSettings } from "./types";

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
  return JSON.parse(raw) as AppSettings;
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
  return JSON.parse(raw) as DailyData;
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

export function getCheckInsForRoom(roomNumber: string): CheckInRecord[] {
  const data = getTodayData();
  if (!data) return [];
  return data.checkIns.filter((c) => c.roomNumber === roomNumber);
}

export function clearDayData(date: string): void {
  localStorage.removeItem(getKey(date));
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

  // Save to history
  const history = getSessionHistory();
  history.unshift(record);
  // Keep last 30 sessions
  if (history.length > 30) history.length = 30;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // QuotaExceededError
  }

  // Clear today's data
  clearDayData(data.date);

  return record;
}

// --- Historical Data (for dashboard) ---

// Get data for the last N days (including today)
export function getHistoricalData(days: number): DailyData[] {
  if (typeof window === "undefined") return [];
  const result: DailyData[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const data = getDataForDate(dateStr);
    if (data) {
      result.push(data);
    }
  }

  return result;
}

// Get data for a custom date range
export function getDataForRange(startDate: string, endDate: string): DailyData[] {
  if (typeof window === "undefined") return [];
  const result: DailyData[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const data = getDataForDate(dateStr);
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
