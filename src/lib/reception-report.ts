import { Client, CheckInRecord } from "./types";
import { isComp } from "./utils";

export type ReceptionStatus =
  | "not_yet"
  | "came_points"
  | "came_paid_onsite"
  | "came_room_charge"
  | "came_pass"
  | "came_compliment"
  | "came_unknown";

export interface ReceptionWatchlistEntry {
  roomNumber: string;
  name: string;
  vipLevel: string;
  vipNotes: string;
  vipSource: "list_only" | "walk_in" | "breakfast_list" | "unknown";
  status: ReceptionStatus;
  checkInTimestamp?: string;
  peopleEntered: number;
  expectedAdults: number;
  expectedChildren: number;
  isLegacyData: boolean;
}

function findCheckInForClient(
  client: Client,
  checkIns: CheckInRecord[]
): CheckInRecord | undefined {
  const normName = client.name.trim().toLowerCase().replace(/\s+/g, " ");
  return checkIns.find(
    (ci) =>
      ci.roomNumber === client.roomNumber &&
      ci.clientName.trim().toLowerCase().replace(/\s+/g, " ") === normName
  );
}

function deriveStatus(
  client: Client,
  ci: CheckInRecord | undefined
): ReceptionStatus {
  if (!ci) return "not_yet";
  if (isComp(client)) return "came_compliment";
  switch (ci.paymentAction) {
    case "points":
      return "came_points";
    case "pay_onsite":
      return "came_paid_onsite";
    case "room_charge":
      return "came_room_charge";
    case "pass":
      return "came_pass";
    default:
      return "came_unknown";
  }
}

/**
 * Returns the reception watchlist: VIPs who are NOT on the breakfast list
 * (vipSource ∈ ['list_only', 'walk_in']), with their current check-in status.
 *
 * Fallback for legacy data (no vipSource field): returns ALL VIPs flagged
 * `isLegacyData: true` so the UI can warn the user.
 */
export function getReceptionWatchlist(
  clients: Client[],
  checkIns: CheckInRecord[]
): ReceptionWatchlistEntry[] {
  const hasAnyVipSource = clients.some((c) => c.vipSource !== undefined);
  const isLegacy = !hasAnyVipSource;

  const filtered = clients.filter((c) => {
    if (!c.isVip) return false;
    if (isLegacy) return true;
    return c.vipSource === "list_only" || c.vipSource === "walk_in";
  });

  return filtered.map((c) => {
    const ci = findCheckInForClient(c, checkIns);
    return {
      roomNumber: c.roomNumber,
      name: c.name,
      vipLevel: c.vipLevel || "",
      vipNotes: c.vipNotes || "",
      vipSource: c.vipSource ?? "unknown",
      status: deriveStatus(c, ci),
      checkInTimestamp: ci?.timestamp,
      peopleEntered: ci?.peopleEntered ?? 0,
      expectedAdults: c.adults,
      expectedChildren: c.children,
      isLegacyData: isLegacy,
    };
  });
}

export function countByStatus(
  entries: ReceptionWatchlistEntry[]
): Record<ReceptionStatus, number> {
  const counts: Record<ReceptionStatus, number> = {
    not_yet: 0,
    came_points: 0,
    came_paid_onsite: 0,
    came_room_charge: 0,
    came_pass: 0,
    came_compliment: 0,
    came_unknown: 0,
  };
  for (const e of entries) counts[e.status]++;
  return counts;
}
