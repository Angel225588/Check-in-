import { Client, CheckInRecord, DailyData, SessionRecord } from "./types";
import {
  mockMorningBrief,
  saveMorningBrief,
  type ForecastDay,
} from "./morning-brief";

/**
 * Realistic mock dataset for local testing.
 * Use the "Seed Mock Data" button on /debug to inject this into localStorage.
 *
 * Designed to exercise every UI feature:
 * - 100+ rooms across 7 days
 * - VIPs (in-list + off-list + walk-in) with mixed payment modes
 * - Compliments, walk-ins, extras (over-counts), no-shows
 * - A peak between 08:00 and 09:00 every day
 * - Top packages: BKF INC, BKF COMP, BKF GRP, BKF EXCL
 */

const FRENCH_NAMES = [
  "Dupont Marie", "Martin Jean", "Bernard Luc", "Petit Sophie", "Robert Pierre",
  "Richard Anne", "Durand Claire", "Moreau Paul", "Laurent Lucie", "Simon Marc",
  "Michel Élise", "Lefebvre Henri", "Leroy Camille", "Roux François", "David Julie",
  "Bertrand Olivier", "Morel Sabine", "Fournier Antoine", "Girard Inès", "Bonnet Hugo",
  "Dupuis Léa", "Lambert Théo", "Fontaine Laure", "Rousseau Vincent", "Vincent Maxime",
];
const INTL_NAMES = [
  "Wong Helen", "Tanaka Hiroshi", "Schmidt Lena", "Garcia Carlos", "Kim Min-Jun",
  "Patel Priya", "O'Brien Sean", "Müller Klaus", "Singh Arjun", "Rossi Luca",
  "Chen Wei", "Smith Emma", "Johansson Astrid", "Park Eun-Ji", "Hassan Layla",
];
const ROOM_TYPES = ["DLXK", "PRMK", "STHT", "STKD", "STKG", "EXST"];
const VIP_LEVELS = ["X4", "X5", "Platinum", "Gold", "Silver", "Bronze"];
const PACKAGES = [
  { code: "BKF INC", weight: 5 },   // 50% — included in rate
  { code: "BKF GRP", weight: 2 },
  { code: "BKF COMP", weight: 1 },  // 10% — compliments
  { code: "BKF EXCL", weight: 1 },
  { code: "", weight: 1 },          // some without breakfast pkg
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(arr: { code: T; weight: number }[]): T {
  const total = arr.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of arr) {
    if (r < e.weight) return e.code;
    r -= e.weight;
  }
  return arr[0].code;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildClient(
  roomNumber: string,
  name: string,
  opts: Partial<Client> = {}
): Client {
  return {
    roomNumber,
    roomType: pick(ROOM_TYPES),
    rtc: "",
    confirmationNumber: String(Math.floor(80000000 + Math.random() * 19999999)),
    name,
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "CKIN",
    adults: 1 + Math.floor(Math.random() * 2),
    children: Math.random() < 0.2 ? 1 : 0,
    rateCode: "",
    packageCode: pickWeighted(PACKAGES),
    vipSource: "breakfast_list",
    ...opts,
  };
}

function buildDay(date: string, scale = 1): { clients: Client[]; checkIns: CheckInRecord[] } {
  const allNames = [...FRENCH_NAMES, ...INTL_NAMES];
  const baseRooms = 80 + Math.floor(Math.random() * 30); // 80-110
  const numRooms = Math.max(20, Math.round(baseRooms * scale));
  const clients: Client[] = [];
  const used = new Set<string>();

  for (let i = 0; i < numRooms; i++) {
    let room = "";
    do {
      const floor = 1 + Math.floor(Math.random() * 8);
      const num = 1 + Math.floor(Math.random() * 30);
      room = `${floor}${pad(num)}`;
    } while (used.has(room));
    used.add(room);

    const name = allNames[i % allNames.length];
    clients.push(buildClient(room, name));
  }

  // Sprinkle VIPs from the breakfast list (scale with room count)
  const numVips = Math.min(clients.length, Math.max(3, Math.round(12 * scale)));
  for (let i = 0; i < numVips; i++) {
    const c = clients[Math.floor((i / numVips) * clients.length)];
    if (c) {
      c.isVip = true;
      c.vipLevel = pick(VIP_LEVELS);
    }
  }

  // Add ~3 VIPs that are list-only (off-list)
  for (let i = 0; i < Math.max(1, Math.round(3 * scale)); i++) {
    let room = "";
    do {
      const floor = 1 + Math.floor(Math.random() * 8);
      const num = 1 + Math.floor(Math.random() * 30);
      room = `${floor}${pad(num)}`;
    } while (used.has(room));
    used.add(room);
    clients.push(
      buildClient(room, `VIP ${pick(allNames)}`, {
        isVip: true,
        vipLevel: pick(VIP_LEVELS),
        vipSource: "list_only",
        packageCode: "",
      })
    );
  }

  // Add ~5 walk-ins (scaled)
  const numWalkIns = Math.max(1, Math.round(5 * scale));
  for (let i = 0; i < numWalkIns; i++) {
    let room = "";
    do {
      const floor = 1 + Math.floor(Math.random() * 8);
      const num = 1 + Math.floor(Math.random() * 30);
      room = `${floor}${pad(num)}`;
    } while (used.has(room));
    used.add(room);
    clients.push(
      buildClient(room, `Walk-in ${i + 1}`, {
        vipSource: "walk_in",
        adults: 1,
        children: 0,
        packageCode: "",
      })
    );
  }

  // Generate check-ins — 75-85% attendance, peak between 08:00-09:00
  const checkIns: CheckInRecord[] = [];
  for (const c of clients) {
    if (Math.random() < 0.78) {
      // Peak distribution: weighted around 08:30
      const minutesFromStart = Math.max(
        0,
        Math.min(300, Math.round(150 + (Math.random() - 0.5) * 200))
      );
      const totalMinutes = 6 * 60 + minutesFromStart;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const ts = `${date}T${pad(hour)}:${pad(minute)}:00.000Z`;

      // ~5% extras (entered > expected)
      const expected = c.adults + c.children;
      const peopleEntered = Math.random() < 0.05 ? expected + 1 : expected;

      // Payment action for off-list entries
      let paymentAction: string | undefined;
      if (c.vipSource === "list_only") {
        paymentAction = pick(["points", "cash", "room", "card"]);
      } else if (c.vipSource === "walk_in") {
        paymentAction = pick(["cash", "card", "room"]);
      }

      checkIns.push({
        id: `${date}_${c.roomNumber}_${c.name}`,
        roomNumber: c.roomNumber,
        clientName: c.name,
        peopleEntered,
        timestamp: ts,
        paymentAction,
      });
    }
  }

  return { clients, checkIns };
}

function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

/**
 * Inject 7 days of mock data + a current day in localStorage.
 * Removes any existing dailyData_* and sessionHistory before seeding.
 */
export function seedMockData(): { sessions: number; clientsToday: number } {
  // Wipe existing app data (preserve settings/user prefs)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("dailyData_") || key === "sessionHistory") {
      localStorage.removeItem(key);
    }
  }

  // Seed 6 historic days as session history (closed sessions)
  const sessions: SessionRecord[] = [];
  for (let offset = 6; offset >= 1; offset--) {
    const date = todayStr(-offset);
    const day = buildDay(date);
    const totalGuests = day.clients.reduce(
      (s, c) => s + c.adults + c.children,
      0
    );
    const totalEntered = day.checkIns.reduce(
      (s, c) => s + c.peopleEntered,
      0
    );
    sessions.push({
      date,
      closedAt: `${date}T11:30:00.000Z`,
      totalRooms: day.clients.length,
      totalGuests,
      totalEntered,
      totalRemaining: Math.max(0, totalGuests - totalEntered),
      totalVip: day.clients.filter((c) => c.isVip).length,
      clients: day.clients,
      checkIns: day.checkIns,
      rawUploadText: `[Mock data for ${date}]`,
    });
  }
  localStorage.setItem("sessionHistory", JSON.stringify(sessions.reverse()));

  // Seed today as the active session (open)
  const today = todayStr(0);
  const todayData = buildDay(today);
  const activeData: DailyData = {
    date: today,
    clients: todayData.clients,
    checkIns: todayData.checkIns,
    rawUploadText: `[Mock data for ${today}]`,
  };
  localStorage.setItem(
    `dailyData_${today}`,
    JSON.stringify(activeData)
  );

  return {
    sessions: sessions.length,
    clientsToday: todayData.clients.length,
  };
}

/**
 * Compute a per-day scale factor for realistic 6-month variation.
 * Combines day-of-week pattern (business hotel: weekends lower),
 * monthly seasonality (summer peak), gentle growth trend, and noise.
 */
function scaleForDate(date: string, dayIndex: number, totalDays: number): number {
  const dt = new Date(date + "T12:00:00");
  const dow = dt.getDay(); // 0=Sun ... 6=Sat
  const month = dt.getMonth(); // 0=Jan ... 11=Dec
  const dowFactor = dow === 0 ? 0.7 : dow === 6 ? 0.78 : dow === 5 ? 0.92 : 1.0;
  const monthFactors = [0.85, 0.85, 0.95, 1.0, 1.05, 1.1, 1.15, 1.15, 1.05, 1.0, 0.9, 0.95];
  const monthFactor = monthFactors[month];
  const growthFactor = 1 + (dayIndex / Math.max(1, totalDays - 1)) * 0.08;
  const noise = 0.92 + Math.random() * 0.16;
  return dowFactor * monthFactor * growthFactor * noise;
}

/**
 * Compact session for historical demo days. ~600 bytes vs ~75 KB for a full day.
 * Keeps just enough fidelity for the chart (daily totals, peak-hour bucket)
 * and dashboard analytics (aggregate adults/guests). Older days don't need
 * per-room VIP/package detail.
 */
function buildCompactDay(date: string, scale: number): SessionRecord {
  const totalRooms = Math.max(20, Math.round(95 * scale));
  const totalGuests = Math.round(totalRooms * 1.45);
  const attendance = 0.74 + Math.random() * 0.12;
  const totalEntered = Math.round(totalGuests * attendance);

  // One aggregate stub client (carries totalGuests as adults so dashboard math works)
  const clients: Client[] = [
    {
      roomNumber: "000",
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: "(demo)",
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "CKIN",
      adults: totalGuests,
      children: 0,
      rateCode: "",
      packageCode: "",
    },
  ];

  // One aggregate check-in at 08:30 (peak hour bucket)
  const checkIns: CheckInRecord[] = totalEntered > 0
    ? [
        {
          id: `${date}_compact`,
          roomNumber: "000",
          clientName: "(demo)",
          peopleEntered: totalEntered,
          timestamp: `${date}T08:30:00.000Z`,
        },
      ]
    : [];

  return {
    date,
    closedAt: `${date}T11:30:00.000Z`,
    totalRooms,
    totalGuests,
    totalEntered,
    totalRemaining: Math.max(0, totalGuests - totalEntered),
    totalVip: 0,
    clients,
    checkIns,
    rawUploadText: "",
  };
}

/**
 * Realistic forecast for the next 7 days. Paris business-hotel pattern:
 * weekdays high (peak Thu/Fri), weekend lower. Mixes occupancies that will
 * trigger staffing alerts (≥80% warn, ≥95% danger) so the dashboard's
 * "Prévision 7 jours" + alert list both show real content.
 */
function buildDynamicForecast(): ForecastDay[] {
  const today = new Date();
  const dowPattern = [0.50, 0.68, 0.80, 0.88, 0.94, 0.97, 0.58]; // Sun..Sat
  const dayNames = [
    "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
  ];
  const forecast: ForecastDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const base = dowPattern[dow];
    const noise = (Math.random() - 0.5) * 0.05;
    const occupancyPercent = Math.max(20, Math.min(100, (base + noise) * 100));
    const sellLimit = 339;
    const occupied = Math.round(sellLimit * (occupancyPercent / 100));
    const arrivals = Math.round(40 + Math.random() * 50);
    const departures = Math.round(35 + Math.random() * 45);
    const label =
      `${dayNames[dow]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    forecast.push({
      date: label,
      sellLimit,
      occupied,
      occupancyPercent: Math.round(occupancyPercent * 10) / 10,
      arrivals,
      departures,
    });
  }
  return forecast;
}

/**
 * Inject N days of mock data with realistic seasonality.
 * - Last 7 historic days: full buildDay (rich VIP / package / per-room detail)
 * - Days 8 → N back: compact stub (aggregate only) so we stay under the
 *   5 MB localStorage quota.
 * Used by the dashboard "Générer 6 mois de démo" button so 3M / 6M views
 * actually show week-over-week and month-over-month patterns.
 */
export function seedDemoMonths(
  days = 180
): { sessions: number; days: number; error?: string } {
  // Wipe existing app data (preserve settings/user prefs)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("dailyData_") || key === "sessionHistory") {
      localStorage.removeItem(key);
    }
  }

  const sessions: SessionRecord[] = [];
  for (let offset = days - 1; offset >= 1; offset--) {
    const date = todayStr(-offset);
    const dayIndex = days - 1 - offset;
    const scale = scaleForDate(date, dayIndex, days);

    if (offset <= 7) {
      const day = buildDay(date, scale);
      const totalGuests = day.clients.reduce(
        (s, c) => s + c.adults + c.children,
        0
      );
      const totalEntered = day.checkIns.reduce(
        (s, c) => s + c.peopleEntered,
        0
      );
      sessions.push({
        date,
        closedAt: `${date}T11:30:00.000Z`,
        totalRooms: day.clients.length,
        totalGuests,
        totalEntered,
        totalRemaining: Math.max(0, totalGuests - totalEntered),
        totalVip: day.clients.filter((c) => c.isVip).length,
        clients: day.clients,
        checkIns: day.checkIns,
        rawUploadText: "",
      });
    } else {
      sessions.push(buildCompactDay(date, scale));
    }
  }

  try {
    localStorage.setItem("sessionHistory", JSON.stringify(sessions));
  } catch (e) {
    return {
      sessions: 0,
      days,
      error: `Espace de stockage saturé (${(e as Error).message}). Essayez de vider d'abord.`,
    };
  }

  const today = todayStr(0);
  const todayScale = scaleForDate(today, days - 1, days);
  const todayData = buildDay(today, todayScale);
  const activeData: DailyData = {
    date: today,
    clients: todayData.clients,
    checkIns: todayData.checkIns,
    rawUploadText: "",
  };
  try {
    localStorage.setItem(`dailyData_${today}`, JSON.stringify(activeData));
  } catch (e) {
    return {
      sessions: sessions.length,
      days,
      error: `Données historiques OK mais aujourd'hui non sauvegardé: ${(e as Error).message}`,
    };
  }

  // Morning brief — populates "Prévision 7 jours" + staffing alerts on dashboard
  try {
    const brief = mockMorningBrief(today);
    brief.forecast = buildDynamicForecast();
    saveMorningBrief(brief);
  } catch {
    // Brief is optional decoration — chart still works without it
  }

  return { sessions: sessions.length, days };
}

/**
 * Wipe all session/daily data (used by the "Clear All" button on /debug).
 * Preserves settings, language, theme, and other user preferences.
 */
export function wipeMockData(): number {
  let deleted = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith("dailyData_") ||
      key === "sessionHistory" ||
      key.startsWith("morningStaffCount_")
    ) {
      localStorage.removeItem(key);
      deleted++;
    }
  }
  return deleted;
}
