import { Client, CheckInRecord } from "./types";

export function getTotalGuests(clients: Client[]): number {
  return clients.reduce((sum, c) => sum + c.adults + c.children, 0);
}

export function getCheckedInCount(checkIns: CheckInRecord[]): number {
  return checkIns.reduce((sum, c) => sum + c.peopleEntered, 0);
}

export function normalizeNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getEnteredForClient(
  client: Client,
  checkIns: CheckInRecord[]
): number {
  const normName = normalizeNameForMatch(client.name);
  return checkIns
    .filter(
      (c) =>
        c.roomNumber === client.roomNumber &&
        normalizeNameForMatch(c.clientName) === normName
    )
    .reduce((sum, c) => sum + c.peopleEntered, 0);
}

export function getRemainingForRoom(
  client: Client,
  checkIns: CheckInRecord[]
): number {
  const entered = getEnteredForClient(client, checkIns);
  return Math.max(0, client.adults + client.children - entered);
}

export function getEnteredForRoom(
  roomNumber: string,
  checkIns: CheckInRecord[]
): number {
  return checkIns
    .filter((c) => c.roomNumber === roomNumber)
    .reduce((sum, c) => sum + c.peopleEntered, 0);
}

export function getCompStats(
  clients: Client[],
  checkIns: CheckInRecord[]
): { entered: number; total: number } {
  const compClients = clients.filter((c) =>
    c.packageCode.toUpperCase().includes("BKF COMP")
  );
  const total = compClients.reduce((sum, c) => sum + c.adults + c.children, 0);
  const entered = compClients.reduce(
    (sum, c) => sum + getEnteredForClient(c, checkIns),
    0
  );
  return { entered, total };
}

export function searchClients(
  clients: Client[],
  query: string,
  mode: "numeric" | "alpha"
): Client[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();

  if (mode === "numeric") {
    return clients.filter((c) => c.roomNumber.startsWith(q));
  }
  return clients.filter((c) => c.name.toLowerCase().includes(q));
}

export function isComp(client: Client): boolean {
  return client.packageCode.toUpperCase().includes("BKF COMP");
}

export function getRoomStatusCounts(
  clients: Client[],
  checkIns: CheckInRecord[]
): { allIn: number; partial: number; noShow: number; totalRooms: number } {
  let allIn = 0, partial = 0, noShow = 0;
  for (const c of clients) {
    const total = c.adults + c.children;
    const entered = getEnteredForClient(c, checkIns);
    if (entered >= total && total > 0) allIn++;
    else if (entered > 0) partial++;
    else noShow++;
  }
  return { allIn, partial, noShow, totalRooms: clients.length };
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
