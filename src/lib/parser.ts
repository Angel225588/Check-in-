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

// Parse OCR text output from the R118 Package Forecast report
// The report has fixed columns and OCR may produce messy spacing
export function parseOCRText(text: string): Client[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const clients: Client[] = [];

  // Known header keywords to skip
  const skipPatterns = [
    /room\s*no/i,
    /room\s*type/i,
    /package\s*forecast/i,
    /page\s*\d+/i,
    /output\s*detailed/i,
    /from\s*date/i,
    /include\s*/i,
    /filter/i,
    /^rtc$/i,
    /^conf/i,
    /^name$/i,
    /^arrival/i,
    /^departure/i,
    /^resv/i,
    /^adl/i,
    /^chl/i,
    /^rate/i,
    /^package\s*codes?$/i,
    /pkgforecast/i,
  ];

  for (const line of lines) {
    // Skip header/footer lines
    if (skipPatterns.some((p) => p.test(line))) continue;
    if (line.length < 5) continue;

    // Try to extract a room number at the start (3-4 digit number)
    const roomMatch = line.match(/^(\d{3,4})\b/);
    if (!roomMatch) continue;

    const roomNumber = roomMatch[1];

    // Split the rest by multiple spaces (OCR typically separates columns with spaces)
    const rest = line.substring(roomMatch[0].length).trim();
    const parts = rest.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);

    // Try to identify columns from the parts
    // Expected order after room: RoomType, RTC, ConfNo, Name, Arrival, Departure, Status, Adults, Children, RateCode, PackageCode
    const client: Client = {
      roomNumber,
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: "",
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "",
      adults: 1,
      children: 0,
      rateCode: "",
      packageCode: "",
    };

    // Find dates (dd/mm/yy or dd/mm/yyyy patterns)
    const datePattern = /\d{1,2}\/\d{1,2}\/\d{2,4}/g;
    const dates: string[] = [];
    const statusPattern = /\b(DUOT|CKIN|COUT|DKIN|NOSH)\b/i;
    const packagePattern = /\b(BKF\s*(?:GRP|INC|COMP|EXCL|GTT)|UPSFPDJ)\b/i;
    const roomTypePattern = /\b(DLXK|PRMK|STHT|STKD|STKG|DLXJ|EXST)\b/i;

    // Scan all parts for known patterns
    const nameParts: string[] = [];

    for (const part of parts) {
      const dateMatches = part.match(datePattern);
      if (dateMatches) {
        dates.push(...dateMatches);
        continue;
      }

      const statusMatch = part.match(statusPattern);
      if (statusMatch) {
        client.reservationStatus = statusMatch[1].toUpperCase();
        continue;
      }

      const pkgMatch = part.match(packagePattern);
      if (pkgMatch) {
        client.packageCode = pkgMatch[1].toUpperCase();
        continue;
      }

      const rtMatch = part.match(roomTypePattern);
      if (rtMatch) {
        if (!client.roomType) {
          client.roomType = rtMatch[1].toUpperCase();
        } else {
          client.rtc = rtMatch[1].toUpperCase();
        }
        continue;
      }

      // Check if it's a pure number (adults/children)
      if (/^\d{1,2}$/.test(part)) {
        const num = parseInt(part, 10);
        if (client.adults === 1 && num >= 0) {
          client.adults = num;
        } else {
          client.children = num;
        }
        continue;
      }

      // Check for confirmation number (long number)
      if (/^\d{6,}$/.test(part)) {
        client.confirmationNumber = part;
        continue;
      }

      // Check for rate code (short uppercase code)
      if (/^[A-Z0-9]{3,8}$/.test(part) && !roomTypePattern.test(part) && !statusPattern.test(part)) {
        if (!client.rateCode) {
          client.rateCode = part;
        }
        continue;
      }

      // Otherwise it's likely part of the name
      if (part.length > 1 && /[a-zA-Z]/.test(part)) {
        nameParts.push(part);
      }
    }

    // Assign dates
    if (dates.length >= 2) {
      client.arrivalDate = dates[0];
      client.departureDate = dates[1];
    } else if (dates.length === 1) {
      client.arrivalDate = dates[0];
    }

    // Assign name
    client.name = nameParts.join(" ") || "Unknown";

    clients.push(client);
  }

  return clients;
}
