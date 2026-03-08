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
  isVip?: boolean;
  vipLevel?: string;
  vipNotes?: string;
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
