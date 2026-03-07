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
}
