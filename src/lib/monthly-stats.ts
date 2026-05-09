import { DailyData } from "./types";
import { getCompStats, getCheckedInCount, getTotalGuests } from "./utils";
import { getTopPackages } from "./analytics";
import { generateDayReport } from "./report";

export interface MonthlyStats {
  daysActive: number;
  firstDay: string;
  lastDay: string;
  totalExpected: number;
  totalServed: number;
  attendanceRate: number;       // percentage
  attendanceRateMin: number;    // worst day
  attendanceRateMax: number;    // best day
  noShows: number;
  compRooms: number;
  compPersons: number;
  compCost: number;
  walkInPaid: number;
  walkInPoints: number;
  walkInRoom: number;
  walkInCompliment: number;
  walkInTotal: number;
  vipsServed: number;
  vipsTotal: number;
  vipsMissed: number;
  topPackages: { code: string; rooms: number }[];
  peakHourMostCommon: string;   // e.g. "08:30"
  totalExtras: number;
}

function dailyAttendanceRate(d: DailyData): number {
  const expected = getTotalGuests(d.clients);
  const served = getCheckedInCount(d.checkIns);
  if (expected === 0) return 0;
  return Math.min(100, Math.round((served / expected) * 100));
}

function findDailyPeakHour(d: DailyData): string | null {
  const buckets: Map<string, number> = new Map();
  for (const ci of d.checkIns) {
    const dt = new Date(ci.timestamp);
    const key = `${String(dt.getHours()).padStart(2, "0")}:${
      dt.getMinutes() < 30 ? "00" : "30"
    }`;
    buckets.set(key, (buckets.get(key) ?? 0) + ci.peopleEntered);
  }
  let peak: string | null = null;
  let peakCount = 0;
  for (const [k, v] of buckets) {
    if (v > peakCount) {
      peak = k;
      peakCount = v;
    }
  }
  return peak;
}

export function computeMonthlyStats(
  historicalData: DailyData[],
  costPerCover: number
): MonthlyStats {
  if (historicalData.length === 0) {
    return {
      daysActive: 0,
      firstDay: "",
      lastDay: "",
      totalExpected: 0,
      totalServed: 0,
      attendanceRate: 0,
      attendanceRateMin: 0,
      attendanceRateMax: 0,
      noShows: 0,
      compRooms: 0,
      compPersons: 0,
      compCost: 0,
      walkInPaid: 0,
      walkInPoints: 0,
      walkInRoom: 0,
      walkInCompliment: 0,
      walkInTotal: 0,
      vipsServed: 0,
      vipsTotal: 0,
      vipsMissed: 0,
      topPackages: [],
      peakHourMostCommon: "",
      totalExtras: 0,
    };
  }

  // Only keep days where some service happened (clients > 0)
  const activeDays = historicalData.filter((d) => d.clients.length > 0);
  const sorted = [...activeDays].sort((a, b) => a.date.localeCompare(b.date));

  let totalExpected = 0;
  let totalServed = 0;
  let totalExtras = 0;
  let compRooms = 0;
  let compPersons = 0;
  let walkInPaid = 0;
  let walkInPoints = 0;
  let walkInRoom = 0;
  let walkInCompliment = 0;
  let vipsServed = 0;
  let vipsTotal = 0;

  const peakHours: Map<string, number> = new Map();
  let attendanceMin = 100;
  let attendanceMax = 0;

  for (const day of activeDays) {
    const expected = getTotalGuests(day.clients);
    const served = getCheckedInCount(day.checkIns);
    totalExpected += expected;
    totalServed += served;

    const rate = dailyAttendanceRate(day);
    if (rate > 0) {
      attendanceMin = Math.min(attendanceMin, rate);
      attendanceMax = Math.max(attendanceMax, rate);
    }

    const comp = getCompStats(day.clients, day.checkIns);
    compRooms += comp.rooms;
    compPersons += comp.entered;

    const report = generateDayReport(day.clients, day.checkIns);
    totalExtras += report.totalExtras;
    walkInPaid += report.sourceBreakdown.byPayment.paid_onsite;
    walkInPoints += report.sourceBreakdown.byPayment.points;
    walkInRoom += report.sourceBreakdown.byPayment.room_charge;
    walkInCompliment += report.sourceBreakdown.byPayment.compliment;

    // VIP attendance — count VIPs that actually had a check-in
    for (const c of day.clients) {
      if (!c.isVip) continue;
      vipsTotal++;
      const normName = c.name.trim().toLowerCase().replace(/\s+/g, " ");
      const came = day.checkIns.some(
        (ci) =>
          ci.roomNumber === c.roomNumber &&
          ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
      );
      if (came) vipsServed++;
    }

    const peak = findDailyPeakHour(day);
    if (peak) peakHours.set(peak, (peakHours.get(peak) ?? 0) + 1);
  }

  let peakHourMostCommon = "";
  let bestPeakCount = 0;
  for (const [k, v] of peakHours) {
    if (v > bestPeakCount) {
      bestPeakCount = v;
      peakHourMostCommon = k;
    }
  }

  const topPackages = getTopPackages(activeDays, 3).map((p) => ({
    code: p.code,
    rooms: p.rooms,
  }));

  return {
    daysActive: activeDays.length,
    firstDay: sorted[0]?.date ?? "",
    lastDay: sorted[sorted.length - 1]?.date ?? "",
    totalExpected,
    totalServed,
    attendanceRate:
      totalExpected > 0
        ? Math.min(100, Math.round((totalServed / totalExpected) * 100))
        : 0,
    attendanceRateMin: attendanceMax > 0 ? attendanceMin : 0,
    attendanceRateMax: attendanceMax,
    noShows: Math.max(0, totalExpected - totalServed),
    compRooms,
    compPersons,
    compCost: compPersons * costPerCover,
    walkInPaid,
    walkInPoints,
    walkInRoom,
    walkInCompliment,
    walkInTotal: walkInPaid + walkInPoints + walkInRoom + walkInCompliment,
    vipsServed,
    vipsTotal,
    vipsMissed: Math.max(0, vipsTotal - vipsServed),
    topPackages,
    peakHourMostCommon,
    totalExtras,
  };
}

/**
 * Generates a markdown summary of the monthly stats — ready to paste
 * into an email or messaging app.
 */
export function formatMonthlyStatsMarkdown(stats: MonthlyStats): string {
  if (stats.daysActive === 0) {
    return "Aucune donnée pour la période.";
  }

  const lines: string[] = [];
  lines.push(`## Bilan Pilote — ${stats.firstDay} → ${stats.lastDay}`);
  lines.push("");
  lines.push(`**${stats.daysActive} jours d'utilisation active** · zéro papier`);
  lines.push("");
  lines.push("### Volumes");
  lines.push(`- ${stats.totalServed} petits-déjeuners pointés sur ${stats.totalExpected} attendus`);
  lines.push(`- Taux d'assistance moyen : **${stats.attendanceRate}%** (min ${stats.attendanceRateMin}% · max ${stats.attendanceRateMax}%)`);
  lines.push(`- ${stats.noShows} no-shows comptabilisés`);
  if (stats.peakHourMostCommon) {
    lines.push(`- Pic d'affluence type : **${stats.peakHourMostCommon}**`);
  }
  lines.push("");
  lines.push("### Compliments");
  lines.push(`- ${stats.compRooms} chambres · ${stats.compPersons} personnes (adultes uniquement)`);
  lines.push(`- Coût documenté : **${stats.compCost.toLocaleString("fr-FR")} €**`);
  lines.push("");
  lines.push("### Walk-ins");
  lines.push(`- ${stats.walkInTotal} couverts hors liste petit-déjeuner`);
  lines.push(`  - ${stats.walkInPaid} payés sur place`);
  lines.push(`  - ${stats.walkInPoints} sur points fidélité`);
  lines.push(`  - ${stats.walkInRoom} portés sur la chambre`);
  lines.push(`  - ${stats.walkInCompliment} en compliment`);
  lines.push("");
  lines.push("### VIPs");
  lines.push(`- ${stats.vipsServed} VIPs servis sur ${stats.vipsTotal} (${stats.vipsMissed} non-vus)`);
  lines.push("");
  if (stats.topPackages.length > 0) {
    lines.push("### Top packages");
    stats.topPackages.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.code} — ${p.rooms} chambres`);
    });
    lines.push("");
  }
  lines.push("---");
  lines.push("*Données extraites automatiquement de l'application Check-in PWA.*");

  return lines.join("\n");
}
