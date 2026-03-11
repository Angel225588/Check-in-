import { Client } from "./types";

export interface MergeResult {
  merged: Client[];
  added: number;
  duplicatesSkipped: number;
  existing: number;
}

function normalizeNameForKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

function clientKey(c: Client): string {
  return `${c.roomNumber}::${normalizeNameForKey(c.name)}`;
}

/**
 * Merge incoming clients into existing ones.
 * - Existing clients are preserved (including VIP flags, check-in status, etc.)
 * - Duplicates (same room + normalized name) are skipped
 * - New clients are appended at the end
 */
export function mergeNewClients(
  existing: Client[],
  incoming: Client[]
): MergeResult {
  const seen = new Set<string>();
  const merged = [...existing];

  // Index existing clients
  for (const c of existing) {
    seen.add(clientKey(c));
  }

  let added = 0;
  let duplicatesSkipped = 0;

  for (const c of incoming) {
    const key = clientKey(c);
    if (seen.has(key)) {
      duplicatesSkipped++;
    } else {
      seen.add(key);
      merged.push(c);
      added++;
    }
  }

  return {
    merged,
    added,
    duplicatesSkipped,
    existing: existing.length,
  };
}
