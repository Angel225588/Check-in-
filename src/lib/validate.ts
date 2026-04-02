/**
 * Shared validation and normalization for client data.
 * Used by OCR API routes and parsers.
 */

/** Normalize package code: uppercase, collapse spaces, trim */
export function normalizePackageCode(code: string): string {
  if (!code) return "";
  return code.toUpperCase().replace(/\s+/g, " ").trim();
}

/** Normalize a guest name: collapse spaces, trim */
export function normalizeName(name: string): string {
  if (!name) return "";
  return name.replace(/\s+/g, " ").trim();
}

/** Check if a room number is valid (3-4 digits) */
export function isValidRoomNumber(room: string): boolean {
  return /^\d{3,4}$/.test(room);
}

/** Check if a name is valid (min 2 chars, contains at least one letter) */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && /[a-zA-Z]/.test(trimmed);
}

/** Sanitize a client object from OCR — normalize fields, validate */
export function sanitizeAndValidateClient(obj: Record<string, unknown>): boolean {
  // Strip HTML from all string fields
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "string") {
      obj[key] = (obj[key] as string).replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim().slice(0, 200);
    }
  }

  // Normalize room number
  if (typeof obj.roomNumber === "string") {
    obj.roomNumber = obj.roomNumber.trim();
  }

  // Normalize name
  if (typeof obj.name === "string") {
    obj.name = normalizeName(obj.name as string);
  }

  // Normalize package code
  if (typeof obj.packageCode === "string") {
    obj.packageCode = normalizePackageCode(obj.packageCode as string);
  }

  // Validate
  return (
    typeof obj.roomNumber === "string" &&
    isValidRoomNumber(obj.roomNumber) &&
    typeof obj.name === "string" &&
    isValidName(obj.name)
  );
}
