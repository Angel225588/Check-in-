import { Client, CheckInRecord } from "./types";
import { getRemainingForRoom, getEnteredForRoom, isComp } from "./utils";

export interface RoomReport {
  roomNumber: string;
  name: string;
  totalGuests: number;
  entered: number;
  remaining: number;
  isVip: boolean;
  vipLevel: string;
  isComp: boolean;
  packageCode: string;
  status: "all-in" | "partial" | "no-show";
}

export interface DayReport {
  date: string;
  totalRooms: number;
  totalGuests: number;
  totalEntered: number;
  totalRemaining: number;
  totalVip: number;
  totalComp: number;
  rooms: RoomReport[];
  checkIns: CheckInRecord[];
}

export function generateDayReport(
  clients: Client[],
  checkIns: CheckInRecord[]
): DayReport {
  const rooms: RoomReport[] = clients.map((client) => {
    const totalGuests = client.adults + client.children;
    const entered = getEnteredForRoom(client.roomNumber, checkIns);
    const remaining = getRemainingForRoom(client, checkIns);

    let status: RoomReport["status"] = "no-show";
    if (remaining === 0 && totalGuests > 0) status = "all-in";
    else if (entered > 0) status = "partial";

    return {
      roomNumber: client.roomNumber,
      name: client.name,
      totalGuests,
      entered,
      remaining,
      isVip: client.isVip || false,
      vipLevel: client.vipLevel || "",
      isComp: isComp(client),
      packageCode: client.packageCode,
      status,
    };
  });

  const totalGuests = rooms.reduce((s, r) => s + r.totalGuests, 0);
  const totalEntered = rooms.reduce((s, r) => s + r.entered, 0);

  return {
    date: new Date().toISOString().split("T")[0],
    totalRooms: rooms.length,
    totalGuests,
    totalEntered,
    totalRemaining: totalGuests - totalEntered,
    totalVip: rooms.filter((r) => r.isVip).length,
    totalComp: rooms.filter((r) => r.isComp).length,
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
  const header = "Room,Name,Total Guests,Entered,Remaining,Status,VIP,Comp,Package";
  const rows = report.rooms.map((r) =>
    [
      r.roomNumber,
      csvField(r.name),
      r.totalGuests,
      r.entered,
      r.remaining,
      STATUS_LABELS[r.status],
      r.isVip ? r.vipLevel || "Yes" : "No",
      r.isComp ? "Yes" : "No",
      csvField(r.packageCode),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}
