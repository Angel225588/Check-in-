import { DailyData, CheckInRecord, Client, SessionRecord } from "./types";

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function getKey(date: string): string {
  return `dailyData_${date}`;
}

const HISTORY_KEY = "sessionHistory";

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

// Session history

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
