import { Client, CheckInRecord, DailyData, SessionRecord } from "./types";

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

function buildDay(date: string): { clients: Client[]; checkIns: CheckInRecord[] } {
  const allNames = [...FRENCH_NAMES, ...INTL_NAMES];
  const numRooms = 80 + Math.floor(Math.random() * 30); // 80-110
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

  // Sprinkle ~12 VIPs from the breakfast list
  for (let i = 0; i < 12; i++) {
    const c = clients[i * 7];
    if (c) {
      c.isVip = true;
      c.vipLevel = pick(VIP_LEVELS);
    }
  }

  // Add ~3 VIPs that are list-only (off-list)
  for (let i = 0; i < 3; i++) {
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

  // Add ~5 walk-ins
  for (let i = 0; i < 5; i++) {
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
        paymentAction = pick(["points", "pay_onsite", "room_charge"]);
      } else if (c.vipSource === "walk_in") {
        paymentAction = pick(["pay_onsite", "points"]);
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
