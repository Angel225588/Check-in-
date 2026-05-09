/**
 * Morning Brief — modèle des données du document quotidien Marriott Courtyard.
 * Reproduit la structure du PDF "Passionate · Forward · Inviting" envoyé chaque
 * matin par le Front Office (Forecast, GSS, Commentaires, Anniversaires,
 * Ambassadors, VIPs, Plaintes, Duty, Groupes, Front Office stats, News, Theme).
 */

export interface ForecastDay {
  date: string;          // "2026-04-30" or "Jeudi 30/04"
  sellLimit: number;
  occupied: number;
  occupiedComp?: number;
  occupancyPercent: number;
  arrivals: number;
  departures: number;
}

export interface GSSScore {
  metric: string;        // "Intent to Recommend", "Staff Overall Service", ...
  mtd?: number;
  ytd?: number;
  brand?: number;
  goal?: number;
  rank?: number;
  highlight?: boolean;   // green = above goal, red = below
}

export interface ClientComment {
  guestName: string;
  source: string;        // "GSS", "HOTELS.COM", "Tripadvisor", ...
  stayPeriod: string;    // "16/04 → 17/04"
  text: string;
  date?: string;
}

export interface SpecialEvent {
  type: "anniversaire" | "honeymoon" | "anniversary-stay" | "other";
  guestName: string;
  roomNumber: string;
  reason?: string;       // free text
  status: "in_house" | "arriving";
  arrivalDate?: string;
}

export interface Ambassador {
  guestName: string;
  roomNumber: string;
  status: "in_house" | "arriving";
  notes?: string;
}

export interface TopVip {
  guestName: string;
  roomNumber: string;
  vipLevel: string;      // "X4", "Platinum", ...
  notes?: string;
}

export interface Complaint {
  guestName: string;
  roomNumber?: string;
  text: string;
  date?: string;
}

export interface DutyDay {
  dayLabel: string;      // "Vendredi 01/05"
  staffName: string;
  staffId?: string;
}

export interface Group {
  code: string;          // "TRACOIN DELP/2SD26a"
  rooms: number;
  contactName?: string;
}

export interface FrontOfficeStats {
  monthlyTargetCapture: number;
  scoreActualMTD: number;
  enrollmentsToday: number;
  enrollmentsGoal: number;
  champion?: string;
}

export interface MorningBrief {
  date: string;
  forecast: ForecastDay[];
  gss: GSSScore[];
  comments: ClientComment[];
  specialEvents: SpecialEvent[];   // anniversaires, honeymoon
  ambassadors: Ambassador[];
  topVips: TopVip[];
  complaints: Complaint[];
  duty: DutyDay[];
  groups: Group[];
  frontOffice?: FrontOfficeStats;
  themeOfDay?: string;
  marriottNews?: string;
  internalAnniversary?: { name: string; role: string }[];
}

const STORAGE_KEY_PREFIX = "morningBrief_";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function getMorningBrief(date: string = todayStr()): MorningBrief | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${date}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MorningBrief;
  } catch {
    return null;
  }
}

export function saveMorningBrief(brief: MorningBrief): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${STORAGE_KEY_PREFIX}${brief.date}`,
    JSON.stringify(brief)
  );
}

export function emptyBrief(date: string = todayStr()): MorningBrief {
  return {
    date,
    forecast: [],
    gss: [],
    comments: [],
    specialEvents: [],
    ambassadors: [],
    topVips: [],
    complaints: [],
    duty: [],
    groups: [],
  };
}

/**
 * Mock brief mirroring the photo Angel sent (Jeudi 30/04/2026) — used for
 * design preview and seed-mock-data.
 */
export function mockMorningBrief(date: string = todayStr()): MorningBrief {
  return {
    date,
    forecast: [
      { date: "Mercredi 29/04", sellLimit: 339, occupied: 156, occupancyPercent: 46.02, arrivals: 72, departures: 92 },
      { date: "Jeudi 30/04", sellLimit: 339, occupied: 136, occupancyPercent: 40.12, arrivals: 40, departures: 60 },
      { date: "Vendredi 01/05", sellLimit: 339, occupied: 149, occupancyPercent: 43.95, arrivals: 48, departures: 35 },
      { date: "Samedi 02/05", sellLimit: 339, occupied: 135, occupancyPercent: 39.82, arrivals: 25, departures: 39 },
      { date: "Dimanche 03/05", sellLimit: 339, occupied: 121, occupancyPercent: 35.69, arrivals: 41, departures: 62 },
      { date: "Lundi 04/05", sellLimit: 339, occupied: 153, occupancyPercent: 45.13, arrivals: 62, departures: 46 },
      { date: "Mardi 05/05", sellLimit: 339, occupied: 168, occupancyPercent: 49.56, arrivals: 46, departures: 33 },
    ],
    gss: [
      { metric: "Intent to Recommend property", mtd: 73.0, ytd: 68.7, brand: 71.2, goal: 67.5, rank: 56 },
      { metric: "Staff Overall Service", mtd: 78.1, ytd: 74.5, brand: 79.0, goal: 73.7, rank: 70 },
      { metric: "Elite Appreciation", mtd: 87.9, ytd: 76.8, brand: 75.0, goal: 71.8, rank: 31 },
      { metric: "Room Cleanliness", mtd: 76.9, ytd: 76.8, brand: 80.0, goal: 74.9, rank: 59 },
      { metric: "Maintenance and Upkeep", mtd: 71.2, ytd: 71.4, brand: 73.8, goal: 69.5, rank: 54 },
      { metric: "F&B Overall", mtd: 60.3, ytd: 59.5, brand: 60.9, goal: 60.7, rank: 51 },
      { metric: "F&B Service", mtd: 70.7, ytd: 65.6, brand: 71.2, rank: 68 },
      { metric: "F&B Quality of Food", mtd: 59.1, ytd: 60.2, brand: 62.8, rank: 51 },
      { metric: "Fitness Center Satisfaction", mtd: 67.9, ytd: 59.0, brand: 60.8, rank: 54 },
      { metric: "Brand Promise Delivery", mtd: 72.1, ytd: 66.6, brand: 67.8, rank: 53 },
    ],
    comments: [
      { guestName: "Mr. Wan-Ting HO", source: "GSS", stayPeriod: "16/04 → 17/04", text: "I stayed for five nights and considered myself a low-maintenance guest, as I only requested room cleaning once. Unfortunately, the shampoo was not refilled upon my arrival and ran out by the third night." },
      { guestName: "Mrs. Chuan TANG", source: "GSS", stayPeriod: "24/04 → 25/04", text: "8.5/10" },
      { guestName: "Mr. Stefan", source: "HOTELS.COM", stayPeriod: "05/05", text: "Clean room, friendly staff, quiet location (we got a room at the back). Breakfast was included; thankfully, otherwise it costs €26 per person (which I find a bit overpriced for what's offered). 5-minute walk from M12 metro line." },
    ],
    specialEvents: [
      { type: "anniversaire", guestName: "Mr. Michael ZORADI", roomNumber: "707", status: "in_house", reason: "Anniversaire", arrivalDate: "19/04 → 03/05" },
      { type: "honeymoon", guestName: "Mr. Shingo HAGIWARA", roomNumber: "708", status: "in_house", reason: "Honeymoon", arrivalDate: "29/04 → 30/04" },
      { type: "anniversaire", guestName: "Mr. Aly SABET", roomNumber: "655", status: "in_house", reason: "Anniversaire", arrivalDate: "28/04 → 01/05" },
      { type: "anniversaire", guestName: "Mr. Anton HAVERKORT", roomNumber: "526", status: "arriving", reason: "Anniversaire de sa fille", arrivalDate: "30/04 → 01/05" },
    ],
    ambassadors: [
      { guestName: "Mr. Paul HEYSCHELABORDE", roomNumber: "551", status: "in_house" },
      { guestName: "Mr. Alexandre THERIAULT", roomNumber: "422", status: "in_house" },
      { guestName: "Mrs. Fernandes RIBEIRO", roomNumber: "508", status: "arriving" },
      { guestName: "Mr. Ibrahim KARL", roomNumber: "415", status: "arriving" },
      { guestName: "Mr. Wu PENGCHUN", roomNumber: "608", status: "arriving" },
    ],
    topVips: [],
    complaints: [],
    duty: [
      { dayLabel: "Vendredi 01/05", staffName: "David", staffId: "6440" },
      { dayLabel: "Samedi 02/05", staffName: "Isabelle", staffId: "6423" },
      { dayLabel: "Dimanche 03/05", staffName: "Clémence", staffId: "6481" },
      { dayLabel: "Vendredi 08/05", staffName: "François", staffId: "6464" },
      { dayLabel: "Samedi 09/05", staffName: "Fady", staffId: "6448" },
      { dayLabel: "Dimanche 10/05", staffName: "Guillaume", staffId: "6410" },
      { dayLabel: "Jeudi 14/05", staffName: "Fanny", staffId: "6449" },
      { dayLabel: "Samedi 16/05", staffName: "Marina", staffId: "6463" },
    ],
    groups: [{ code: "TRACOIN DELP/2SD26a", rooms: 22, contactName: "Camille" }],
    frontOffice: {
      monthlyTargetCapture: 400,
      scoreActualMTD: 555,
      enrollmentsToday: 11,
      enrollmentsGoal: 12,
      champion: "Alexandre",
    },
    themeOfDay: "Où trouver les endroits suivants : barbier, salon de manucure, centre commercial, épicerie, banque, transports en commun, service de location de voiture, magasin d'expédition, mairie, caviste ?",
    marriottNews: "Valeurs de Courtyard — Passionate · In Avant · Inviting · Acceuillant",
    internalAnniversary: [{ name: "Angel POLANCO", role: "Commis de Restaurant" }],
  };
}
