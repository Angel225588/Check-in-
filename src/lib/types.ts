export interface Client {
  roomNumber: string;
  roomType: string;
  rtc: string;
  confirmationNumber: string;
  name: string;
  arrivalDate: string;
  departureDate: string;
  reservationStatus: string;
  adults: number;
  children: number;
  rateCode: string;
  packageCode: string;
  pendingPaymentAction?: string;
  isVip?: boolean;
  vipLevel?: string;
  vipNotes?: string;
  vipSource?: "breakfast_list" | "list_only" | "walk_in";
}

export interface VipEntry {
  roomNumber: string;
  name: string;
  vipLevel: string;
  vipNotes: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  roomType: string;
  adults: number;
  children: number;
  rateCode: string;
}

export interface CheckInRecord {
  id: string;
  roomNumber: string;
  clientName: string;
  peopleEntered: number;
  timestamp: string;
  paymentAction?: string; // 'card' | 'room' | 'points' | 'pass'
}

export interface DailyData {
  date: string;
  clients: Client[];
  checkIns: CheckInRecord[];
  rawUploadText?: string;
}

export interface SessionRecord {
  date: string;
  closedAt: string;
  totalRooms: number;
  totalGuests: number;
  totalEntered: number;
  totalRemaining: number;
  totalVip: number;
  clients: Client[];
  checkIns: CheckInRecord[];
  rawUploadText?: string;
}

export interface AppSettings {
  costPerCover: number; // e.g., 26 (euros)
}

// Dashboard analytics types
export interface DailySnapshot {
  date: string;
  totalExpected: number;
  totalShowedUp: number;
  noShows: number;
  noShowPercent: number;
  compCount: number;
  compShowedUp: number;
  compCost: number;
}

export interface RushHourSlot {
  time: string;      // e.g., "06:00"
  label: string;     // e.g., "6:00"
  count: number;
  isPeak: boolean;
}

export interface TrendDay {
  date: string;
  dayLabel: string;  // e.g., "Mon"
  utilization: number; // percentage 0-100
  noShows: number;
  totalExpected: number;
  totalShowedUp: number;
}
