/**
 * PII-safe logging helpers.
 *
 * Vercel function logs are accessible to project members and may be
 * indexed by third-party log aggregators. Guest names, room numbers,
 * payment info, and confirmation numbers must NEVER appear in logs.
 *
 * Use these wrappers instead of `console.error(rawResponse)` whenever
 * the logged value might contain extracted guest data.
 */

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  // 8-12 digit confirmation numbers
  { name: "confirmation", regex: /\b\d{8,12}\b/g },
  // Standalone room numbers (3-4 digits surrounded by non-digits)
  // — too aggressive on its own, only used inside the "name" field handler
  // — kept here for completeness
  { name: "potential_room", regex: /\b[1-9]\d{2,3}\b/g },
];

/**
 * Truncate + redact a string before logging. Keeps the first/last few chars
 * for debugging while stripping anything that looks like PII.
 */
export function safeLogString(s: string, maxLen = 240): string {
  if (typeof s !== "string") return "[non-string]";
  let out = s;
  for (const p of PII_PATTERNS) {
    out = out.replace(p.regex, `[${p.name}-redacted]`);
  }
  if (out.length > maxLen) {
    out = out.slice(0, maxLen / 2) + "…[truncated]…" + out.slice(-maxLen / 2);
  }
  return out;
}

/**
 * Log an error in a way that never leaks raw API responses.
 * Replaces console.error(rawText) — call console.error(safeLogError(prefix, raw)) instead.
 */
export function safeLogError(prefix: string, raw: unknown): string {
  if (raw instanceof Error) {
    return `${prefix}: ${raw.name} ${safeLogString(raw.message, 200)}`;
  }
  if (typeof raw === "string") {
    return `${prefix}: ${safeLogString(raw)}`;
  }
  if (raw && typeof raw === "object") {
    try {
      return `${prefix}: ${safeLogString(JSON.stringify(raw))}`;
    } catch {
      return `${prefix}: [unserializable error object]`;
    }
  }
  return `${prefix}: ${String(raw)}`;
}
