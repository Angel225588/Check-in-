import { Client, VipEntry } from "./types";

function normalizeNameForMatch(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

function clientMatchesVip(client: Client, vip: VipEntry): boolean {
  if (client.roomNumber !== vip.roomNumber) return false;
  // Match by room number + name similarity (normalized)
  const clientName = normalizeNameForMatch(client.name);
  const vipName = normalizeNameForMatch(vip.name);
  // Check if one contains the other (handles partial names from OCR)
  return (
    clientName === vipName ||
    clientName.includes(vipName) ||
    vipName.includes(clientName)
  );
}

export function mergeVipIntoClients(
  clients: Client[],
  vipEntries: VipEntry[]
): Client[] {
  const updated = clients.map((c) => ({ ...c }));

  for (const vip of vipEntries) {
    // Try to find by room + name first
    let existing = updated.find((c) => clientMatchesVip(c, vip));

    // If no name match, try room-only match (covers OCR name variations)
    if (!existing) {
      existing = updated.find(
        (c) => c.roomNumber === vip.roomNumber && !c.isVip
      );
    }

    if (existing) {
      existing.isVip = true;
      existing.vipLevel = vip.vipLevel;
      existing.vipNotes = vip.vipNotes;
    } else {
      // Check if this room+name combo is already added as VIP
      const alreadyAdded = updated.find(
        (c) =>
          c.roomNumber === vip.roomNumber &&
          c.isVip &&
          normalizeNameForMatch(c.name) === normalizeNameForMatch(vip.name)
      );
      if (alreadyAdded) {
        // Update existing VIP entry (last wins)
        alreadyAdded.vipLevel = vip.vipLevel;
        alreadyAdded.vipNotes = vip.vipNotes;
        continue;
      }

      updated.push({
        roomNumber: vip.roomNumber,
        roomType: vip.roomType || "",
        rtc: "",
        confirmationNumber: vip.confirmationNumber || "",
        name: vip.name,
        arrivalDate: vip.arrivalDate || "",
        departureDate: vip.departureDate || "",
        reservationStatus: "",
        adults: vip.adults || 1,
        children: vip.children || 0,
        rateCode: vip.rateCode || "",
        packageCode: "",
        isVip: true,
        vipLevel: vip.vipLevel,
        vipNotes: vip.vipNotes,
      });
    }
  }

  return updated;
}

export function deduplicateClients(clients: Client[]): Client[] {
  const seen = new Map<string, Client>();
  for (const c of clients) {
    const key = `${c.roomNumber}::${normalizeNameForMatch(c.name)}`;
    seen.set(key, c);
  }
  return Array.from(seen.values());
}
