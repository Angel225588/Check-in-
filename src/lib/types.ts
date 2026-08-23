export interface Client {
  roomNumber: string;
  name: string;
  arrivalDate: string;
  departureDate: string;
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
  arrivalDate: string;
  departureDate: string;
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
  /**
   * Breakfast left the desk in a paper bag rather than being eaten in the
   * restaurant — a coach with a 06:45 departure (US-34).
   *
   * Beside the payment, never instead of it: a group on a room charge that
   * takes bags is still a room charge. And it counts as served, because a box
   * IS breakfast — anything else leaves the morning's figure short by a coach.
   */
  viaBox?: boolean;
}

/**
 * A correction to the guest count the reception sheet arrived with.
 *
 * The sheet says room 123 has one guest; three turn up; reception confirms
 * three. Overwriting the number loses the fact that the source data was wrong,
 * and that error rate is worth watching day to day.
 */
export interface PaxDiscrepancy {
  id: string;
  roomNumber: string;
  clientName: string;
  beforeAdults: number;
  beforeChildren: number;
  afterAdults: number;
  afterChildren: number;
  /** People gained (positive) or lost (negative) versus the sheet. */
  delta: number;
  at: string;
}

export interface DailyData {
  date: string;
  clients: Client[];
  checkIns: CheckInRecord[];
  rawUploadText?: string;
  discrepancies?: PaxDiscrepancy[];
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
  discrepancies?: PaxDiscrepancy[];
}

export interface AppSettings {
  costPerCover: number; // e.g., 26 (euros)
  localOCR?: boolean;   // when true, skip the cloud AI and use Tesseract directly (Marriott-confidential mode)
  /**
   * Which side the activity panel and its controls live on. Reception staff
   * hold the tablet in whichever hand is free; a left-hander reaching across
   * the screen for every control is slower and drops things. Defaults to left.
   */
  handSide?: "left" | "right";
  /** Wider activity panel, for reading long notes without squinting. */
  sideWide?: boolean;
  /**
   * Whether the preview carousel answers to a swipe. On by default; reception
   * can turn it off when the tablet lies flat and gets brushed during service.
   * Nothing becomes unreachable either way — every face is also on a dot.
   */
  swipe?: boolean;
  /** Which metrics reception put on the bar, in their order (US-19). Absent
   *  means "you decide" — the ranking picks, and it re-picks as the day moves. */
  metrics?: string[];
  /** Whether the preview frame is shown at rest. Some mornings the pad and the
   *  list are all anyone wants on screen. The resolved guest card is NOT
   *  covered by this: that one carries the allergy. */
  idlePreview?: boolean;
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
