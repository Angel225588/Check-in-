/**
 * The on-disk shape of a stored note blob: `{ touchedAt, e }`.
 *
 * `touchedAt` sits OUTSIDE the ciphertext so the retention purge can judge a
 * note's age without decrypting every guest's notes on each app load. A date is
 * metadata; the allergy inside is not, and stays encrypted.
 *
 * Notes written before this format are a bare "v.iv.ct" string. `unwrap` still
 * reads them, and the purge never deletes an undated envelope — losing a severe
 * allergy to a storage-format upgrade is the worst outcome available here.
 *
 * This lives in its own module because two writers exist (`notes-store` and the
 * `notes-migrate` recovery pass). Two copies of an envelope format is how one
 * of them silently stops being readable by the other.
 */

export interface NoteEnvelope {
  touchedAt: string;
  e: string;
}

/** Wrap ciphertext for storage, stamped now. */
export function wrapEnvelope(ciphertext: string, touchedAt: string = new Date().toISOString()): string {
  const env: NoteEnvelope = { touchedAt, e: ciphertext };
  return JSON.stringify(env);
}

/** Get the ciphertext out, accepting both the current and the legacy shape. */
export function unwrapEnvelope(raw: string): string {
  if (typeof raw !== "string") return "";
  // A legacy envelope starts with its version prefix and has no braces; only
  // attempt JSON when the value could plausibly be one.
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as Partial<NoteEnvelope>;
    return typeof parsed?.e === "string" ? parsed.e : raw;
  } catch {
    return raw;
  }
}

/** The stored date, or "" for a legacy envelope that has none. */
export function envelopeTouchedAt(raw: string): string {
  if (typeof raw !== "string" || !raw.startsWith("{")) return "";
  try {
    const parsed = JSON.parse(raw) as Partial<NoteEnvelope>;
    return typeof parsed?.touchedAt === "string" ? parsed.touchedAt : "";
  } catch {
    return "";
  }
}
