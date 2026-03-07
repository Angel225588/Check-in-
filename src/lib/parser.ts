import { Client } from "./types";

export function parseCSV(text: string): Client[] {
  const lines = text.trim().split("\n");
  const clients: Client[] = [];

  for (const line of lines) {
    const parts = line.split(/[,\t;]/).map((s) => s.trim());
    if (parts.length < 8) continue;

    // Skip header rows
    if (parts[0].toLowerCase() === "room no" || parts[0].toLowerCase() === "room") continue;

    const client: Client = {
      roomNumber: parts[0] || "",
      roomType: parts[1] || "",
      rtc: parts[2] || "",
      confirmationNumber: parts[3] || "",
      name: parts[4] || "",
      arrivalDate: parts[5] || "",
      departureDate: parts[6] || "",
      reservationStatus: parts[7] || "",
      adults: parseInt(parts[8] || "0", 10) || 0,
      children: parseInt(parts[9] || "0", 10) || 0,
      rateCode: parts[10] || "",
      packageCode: parts[11] || "",
    };

    if (client.roomNumber) {
      clients.push(client);
    }
  }

  return clients;
}

// Simplified parser for the specific report format
// Columns: Room No. | Room Type | RTC | Conf. No. | Name | Arrival Date | Departure Date | Resv. Status | Adl. | Chl. | Rate Code | Package Codes
export function parseReportText(text: string): Client[] {
  return parseCSV(text);
}
