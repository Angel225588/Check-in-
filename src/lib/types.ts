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
  // --- sync fields (optional; absent when sync flag off) ---
  id?: string;                 // random, immutable, minted once at first localStorage entry
  clientLocalKey?: string;     // advisory content key for cross-device first-contact match
  clientRev?: number;          // client-authored LWW clock (bumped once per local edit)
  serverUpdatedAt?: string;    // server pull watermark for this row
  deletedAt?: string | null;   // tombstone
  deviceId?: string;           // device that authored the latest edit (LWW tiebreak)
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
  // --- sync fields (optional; absent when sync flag off) ---
  clientRev?: number;
  serverUpdatedAt?: string;
  deletedAt?: string | null;
  deviceId?: string;
}

export interface DailyData {
  date: string;
  clients: Client[];
  checkIns: CheckInRecord[];
  rawUploadText?: string;
  // --- sync fields (optional; absent when sync flag off) ---
  id?: string;              // server session id (adopted after first upsert)
  sessionRev?: number;      // client-authored LWW clock for the session row
  serverUpdatedAt?: string;
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
  localOCR?: boolean;   // when true, skip Gemini and use Tesseract directly (Marriott-confidential mode)
  /** Which résumé metric boxes the hotel chose to see (personalisation). Undefined = default set. */
  metrics?: string[];
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
