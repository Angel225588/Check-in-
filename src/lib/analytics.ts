import {
  DailyData,
  DailySnapshot,
  RushHourSlot,
  TrendDay,
} from "./types";
import { getTotalGuests, getCheckedInCount, getCompStats } from "./utils";

// --- Daily Snapshot ---

export function getDailySnapshot(
  data: DailyData,
  costPerCover: number
): DailySnapshot {
  const totalExpected = getTotalGuests(data.clients);
  const totalShowedUp = getCheckedInCount(data.checkIns);
  const noShows = Math.max(0, totalExpected - totalShowedUp);
  const noShowPercent =
    totalExpected > 0 ? Math.round((noShows / totalExpected) * 100) : 0;
  const comp = getCompStats(data.clients, data.checkIns);

  return {
    date: data.date,
    totalExpected,
    totalShowedUp,
    noShows,
    noShowPercent,
    compCount: comp.total,
    compShowedUp: comp.entered,
    compCost: comp.entered * costPerCover,
  };
}

// --- Rush Hour Analysis ---

export type BucketMinutes = 5 | 10 | 30 | 60;
const ALLOWED_BUCKETS: BucketMinutes[] = [5, 10, 30, 60];

const SERVICE_START_HOUR = 6;
const SERVICE_END_HOUR = 11; // exclusive upper bound (last slot starts before 12:00)

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function getRushHourSlots(
  data: DailyData,
  bucketMinutes: BucketMinutes = 30
): RushHourSlot[] {
  const bucket: BucketMinutes = ALLOWED_BUCKETS.includes(bucketMinutes)
    ? bucketMinutes
    : 30;

  const slots: { [key: string]: number } = {};
  const slotLabels: string[] = [];

  for (let h = SERVICE_START_HOUR; h <= SERVICE_END_HOUR; h++) {
    for (let m = 0; m < 60; m += bucket) {
      const key = `${pad(h)}:${pad(m)}`;
      slots[key] = 0;
      slotLabels.push(key);
    }
  }

  for (const checkIn of data.checkIns) {
    const d = new Date(checkIn.timestamp);
    const hour = d.getHours();
    const min = d.getMinutes();
    const bucketStart = Math.floor(min / bucket) * bucket;
    const key = `${pad(hour)}:${pad(bucketStart)}`;
    if (key in slots) {
      slots[key] += checkIn.peopleEntered;
    }
  }

  let maxCount = 0;
  for (const key of slotLabels) {
    if (slots[key] > maxCount) maxCount = slots[key];
  }

  return slotLabels.map((key) => ({
    time: key,
    label: key.startsWith("0") ? key.substring(1) : key,
    count: slots[key],
    isPeak: slots[key] === maxCount && maxCount > 0,
  }));
}

// --- 7-Day Trend ---

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getTrendData(historicalData: DailyData[]): TrendDay[] {
  return historicalData
    .map((data) => {
      const totalExpected = getTotalGuests(data.clients);
      const totalShowedUp = getCheckedInCount(data.checkIns);
      const noShows = Math.max(0, totalExpected - totalShowedUp);
      const utilization =
        totalExpected > 0
          ? Math.round((totalShowedUp / totalExpected) * 100)
          : 0;

      const d = new Date(data.date + "T12:00:00");
      const dayLabel = DAY_NAMES[d.getDay()];

      return {
        date: data.date,
        dayLabel,
        utilization,
        noShows,
        totalExpected,
        totalShowedUp,
      };
    })
    .reverse(); // oldest first for chart display
}

// --- Aggregated Stats for a Period ---

export interface PeriodStats {
  totalDays: number;
  totalExpected: number;
  totalShowedUp: number;
  totalNoShows: number;
  avgNoShowPercent: number;
  avgUtilization: number;
  totalCompGuests: number;
  totalCompCost: number;
  peakDay: string;
  peakDayCount: number;
  avgDailyGuests: number;
}

export function getPeriodStats(
  historicalData: DailyData[],
  costPerCover: number
): PeriodStats {
  if (historicalData.length === 0) {
    return {
      totalDays: 0,
      totalExpected: 0,
      totalShowedUp: 0,
      totalNoShows: 0,
      avgNoShowPercent: 0,
      avgUtilization: 0,
      totalCompGuests: 0,
      totalCompCost: 0,
      peakDay: "",
      peakDayCount: 0,
      avgDailyGuests: 0,
    };
  }

  let totalExpected = 0;
  let totalShowedUp = 0;
  let totalCompGuests = 0;
  let peakDay = "";
  let peakDayCount = 0;

  for (const data of historicalData) {
    const expected = getTotalGuests(data.clients);
    const showed = getCheckedInCount(data.checkIns);
    const comp = getCompStats(data.clients, data.checkIns);

    totalExpected += expected;
    totalShowedUp += showed;
    totalCompGuests += comp.entered;

    if (showed > peakDayCount) {
      peakDayCount = showed;
      peakDay = data.date;
    }
  }

  const totalNoShows = Math.max(0, totalExpected - totalShowedUp);

  return {
    totalDays: historicalData.length,
    totalExpected,
    totalShowedUp,
    totalNoShows,
    avgNoShowPercent:
      totalExpected > 0
        ? Math.round((totalNoShows / totalExpected) * 100)
        : 0,
    avgUtilization:
      totalExpected > 0
        ? Math.round((totalShowedUp / totalExpected) * 100)
        : 0,
    totalCompGuests,
    totalCompCost: totalCompGuests * costPerCover,
    peakDay,
    peakDayCount,
    avgDailyGuests:
      historicalData.length > 0
        ? Math.round(totalShowedUp / historicalData.length)
        : 0,
  };
}
