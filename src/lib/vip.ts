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

      // Backfill, never overwrite.
      //
      // For a long time this branch copied those three fields and stopped, so
      // a VIP whose roster row had lost a column stayed blank even though the
      // VIP sheet in the same upload carried the answer. It never showed,
      // because the roster normally has the dates — and the one guest it did
      // show on, room 451 on 20/08, was not on the roster at all and so came
      // through the branch below instead.
      //
      // The roster is the operational document for the morning: where the two
      // disagree the desk works from the roster, so only empties are filled.
      if (!existing.arrivalDate && vip.arrivalDate) existing.arrivalDate = vip.arrivalDate;
      if (!existing.departureDate && vip.departureDate) existing.departureDate = vip.departureDate;
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
        name: vip.name,
        arrivalDate: vip.arrivalDate || "",
        departureDate: vip.departureDate || "",
        adults: vip.adults || 1,
        children: vip.children || 0,
        rateCode: vip.rateCode || "",
        packageCode: "",
        isVip: true,
        vipLevel: vip.vipLevel,
        vipNotes: vip.vipNotes,
        vipSource: "list_only",
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
