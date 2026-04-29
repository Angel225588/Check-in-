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
  vipSource?: "breakfast_list" | "list_only" | "walk_in";
  paymentAction?: string; // last paymentAction used at check-in
}

export interface SourceBreakdown {
  // Breakfast list = clients on the daily PDJ list
  listRooms: number;
  listEntered: number;
  // VIP list only = VIPs not on PDJ list (took breakfast as walk-in)
  vipListOnlyRooms: number;
  vipListOnlyEntered: number;
  // Walk-in = added live (not on either list)
  walkInRooms: number;
  walkInEntered: number;
  // Payment mode totals across walk-ins + list-only VIPs
  byPayment: {
    points: number;
    paid_onsite: number;
    room_charge: number;
    pass: number;
    compliment: number;
  };
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
  sourceBreakdown: SourceBreakdown;
}

function hasBreakfastPackage(client: Client): boolean {
  const pkg = client.packageCode.toUpperCase();
  return /BKF\s*(COMP|INC|GRP|EXCL|GTT)|UPSFPDJ/.test(pkg);
}

function findCheckInPayment(
  client: Client,
  checkIns: CheckInRecord[]
): string | undefined {
  const normName = client.name.trim().toLowerCase().replace(/\s+/g, " ");
  const ci = checkIns.find(
    (c) =>
      c.roomNumber === client.roomNumber &&
      c.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
  );
  return ci?.paymentAction;
}

function buildSourceBreakdown(
  clients: Client[],
  rooms: RoomReport[]
): SourceBreakdown {
  const breakdown: SourceBreakdown = {
    listRooms: 0,
    listEntered: 0,
    vipListOnlyRooms: 0,
    vipListOnlyEntered: 0,
    walkInRooms: 0,
    walkInEntered: 0,
    byPayment: {
      points: 0,
      paid_onsite: 0,
      room_charge: 0,
      pass: 0,
      compliment: 0,
    },
  };

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const room = rooms[i];
    const source = client.vipSource ?? "breakfast_list";

    if (source === "breakfast_list") {
      breakdown.listRooms++;
      breakdown.listEntered += room.entered;
    } else if (source === "list_only") {
      breakdown.vipListOnlyRooms++;
      breakdown.vipListOnlyEntered += room.entered;
    } else if (source === "walk_in") {
      breakdown.walkInRooms++;
      breakdown.walkInEntered += room.entered;
    }

    // Payment breakdown — only count off-list (list_only + walk_in) since
    // they're the ones whose payment mode reception cares about
    if (source !== "breakfast_list" && room.entered > 0) {
      if (room.isComp) breakdown.byPayment.compliment += room.entered;
      else if (room.paymentAction === "points") breakdown.byPayment.points += room.entered;
      else if (room.paymentAction === "pay_onsite") breakdown.byPayment.paid_onsite += room.entered;
      else if (room.paymentAction === "room_charge") breakdown.byPayment.room_charge += room.entered;
      else if (room.paymentAction === "pass") breakdown.byPayment.pass += room.entered;
    }
  }

  return breakdown;
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
      vipSource: client.vipSource,
      paymentAction: findCheckInPayment(client, checkIns),
    };
  });

  const totalGuests = rooms.reduce((s, r) => s + r.totalGuests, 0);
  const totalEntered = rooms.reduce((s, r) => s + r.entered, 0);
  const totalExtras = rooms.reduce((s, r) => s + r.extras, 0);

  const compRooms = new Set(rooms.filter((r) => r.isComp).map((r) => r.roomNumber));
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
    sourceBreakdown: buildSourceBreakdown(clients, rooms),
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
