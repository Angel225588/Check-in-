/**
 * Pure helpers for the OCR API routes — extracted so they can be unit-tested
 * and shared between the server routes and the upload UI.
 */

/** Status codes worth retrying (transient upstream failures from Gemini). */
export function shouldRetryStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/**
 * Parse JSON from a model response, salvaging a valid object/array substring
 * when there is surrounding prose, markdown fences, or trailing truncation.
 * Throws if nothing parseable is found.
 */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Salvage the outermost JSON object or array (handles leading/trailing noise).
    const firstObj = cleaned.indexOf("{");
    const firstArr = cleaned.indexOf("[");

    let start = -1;
    let close = "}";
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      start = firstArr;
      close = "]";
    } else if (firstObj !== -1) {
      start = firstObj;
      close = "}";
    }
    if (start === -1) throw new Error("No JSON found in response");

    const end = cleaned.lastIndexOf(close);
    if (end <= start) throw new Error("Unbalanced JSON in response");

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export interface PackageRow {
  roomNumber: string;
  packageCode: string;
}

/**
 * Overlay package-forecast rows (room → package code) onto a client list.
 * Only fills in a packageCode when the client currently has none and the room
 * matches. Never overwrites an existing packageCode, never removes/renames a
 * client, never adds new rows. Safe to apply to any client list.
 */
export function overlayPackageForecast<
  T extends { roomNumber: string; packageCode: string }
>(clients: T[], packageRows: PackageRow[]): T[] {
  if (packageRows.length === 0 || clients.length === 0) return clients;

  const byRoom = new Map<string, string>();
  for (const r of packageRows) {
    if (r.roomNumber && r.packageCode && !byRoom.has(r.roomNumber)) {
      byRoom.set(r.roomNumber, r.packageCode);
    }
  }
  if (byRoom.size === 0) return clients;

  return clients.map((c) =>
    !c.packageCode && byRoom.has(c.roomNumber)
      ? { ...c, packageCode: byRoom.get(c.roomNumber) as string }
      : c
  );
}

/**
 * De-duplicate client rows merged from parallel PDF page-chunks. Keyed on
 * room + name so the same guest appearing on a chunk boundary is not counted
 * twice. Preserves order (first occurrence wins).
 *
 * The confirmation number used to be part of this key and was removed with the
 * field (docs/GDPR-AUDIT.md section 1.2). Room + name is sufficient: a shared
 * room with two different names stays two rows, which is what the app has
 * always wanted, and the same name twice in the same room on one morning is
 * the same person.
 */
export function dedupClients(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const key = [
      String(r.roomNumber || "").trim(),
      String(r.name || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** De-duplicate package rows by room number (first occurrence wins). */
export function dedupPackageRows(rows: PackageRow[]): PackageRow[] {
  const seen = new Set<string>();
  const out: PackageRow[] = [];
  for (const r of rows) {
    if (seen.has(r.roomNumber)) continue;
    seen.add(r.roomNumber);
    out.push(r);
  }
  return out;
}
