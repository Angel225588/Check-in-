import { Client, CheckInRecord } from "./types";
import { getRemainingForRoom, getEnteredForClient, isComp } from "./utils";

export interface RoomReport {
  roomNumber: string;
  name: string;
  totalGuests: number;
  entered: number;
  remaining: number;
  adults: number; // adults only (children excluded from COMP)
  extras: number; // people entered beyond expected (reception discrepancy)
  isVip: boolean;
  vipLevel: string;
  isComp: boolean;
  hasBreakfast: boolean; // has any breakfast package (BKF INC, BKF COMP, BKF GRP, etc.)
  packageCode: string;
  status: "all-in" | "partial" | "no-show";
}

export interface DayReport {
  date: string;
  totalRooms: number;
  totalGuests: number;
  totalEntered: number;
  totalRemaining: number;
  totalExtras: number; // total extra people beyond expected
  totalVip: number;
  totalComp: number; // unique COMP rooms (not entries)
  totalCompPersons: number; // total COMP persons
  rooms: RoomReport[];
  checkIns: CheckInRecord[];
}

function hasBreakfastPackage(client: Client): boolean {
  const pkg = client.packageCode.toUpperCase();
  return /BKF\s*(COMP|INC|GRP|EXCL|GTT)|UPSFPDJ/.test(pkg);
}

export function generateDayReport(
  clients: Client[],
  checkIns: CheckInRecord[]
): DayReport {
  const rooms: RoomReport[] = clients.map((client) => {
    const totalGuests = client.adults + client.children;
    const entered = getEnteredForClient(client, checkIns);
    const remaining = getRemainingForRoom(client, checkIns);
    const extras = Math.max(0, entered - totalGuests);

    let status: RoomReport["status"] = "no-show";
    if (remaining === 0 && totalGuests > 0) status = "all-in";
    else if (entered > 0) status = "partial";

    return {
      roomNumber: client.roomNumber,
      name: client.name,
      totalGuests,
      adults: client.adults,
      entered,
      remaining,
      extras,
      isVip: client.isVip || false,
      vipLevel: client.vipLevel || "",
      isComp: isComp(client),
      hasBreakfast: hasBreakfastPackage(client),
      packageCode: client.packageCode,
      status,
    };
  });

  const totalGuests = rooms.reduce((s, r) => s + r.totalGuests, 0);
  const totalEntered = rooms.reduce((s, r) => s + r.entered, 0);
  const totalExtras = rooms.reduce((s, r) => s + r.extras, 0);

  // Count COMP by unique room numbers (not by client entries)
  const compRooms = new Set(rooms.filter((r) => r.isComp).map((r) => r.roomNumber));
  // Children don't count for breakfast COMP
  const compPersons = rooms.filter((r) => r.isComp).reduce((s, r) => s + r.adults, 0);

  return {
    date: new Date().toISOString().split("T")[0],
    totalRooms: rooms.length,
    totalGuests,
    totalEntered,
    totalRemaining: totalGuests - totalEntered,
    totalExtras,
    totalVip: rooms.filter((r) => r.isVip).length,
    totalComp: compRooms.size,
    totalCompPersons: compPersons,
    rooms,
    checkIns: [...checkIns].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    ),
  };
}

function csvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const STATUS_LABELS: Record<RoomReport["status"], string> = {
  "all-in": "All In",
  partial: "Partial",
  "no-show": "No Show",
};

export function exportReportCSV(report: DayReport): string {
  const header = "Room,Name,Total Guests,Entered,Remaining,Extras,Status,VIP,Breakfast,Package";
  const rows = report.rooms.map((r) =>
    [
      r.roomNumber,
      csvField(r.name),
      r.totalGuests,
      r.entered,
      r.remaining,
      r.extras,
      STATUS_LABELS[r.status],
      r.isVip ? r.vipLevel || "Yes" : "No",
      r.hasBreakfast ? (r.isComp ? "COMP" : "YES") : "NO",
      csvField(r.packageCode),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
