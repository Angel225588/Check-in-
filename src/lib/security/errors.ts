/**
 * Client-facing errors for the checks this layer adds.
 *
 * The routes already return canned strings and never echo `AiError` text —
 * that part was sound and is left alone. What was missing is a stable
 * machine-readable `code`, so the client can branch on the reason without
 * matching on wording (PhotoCapture previously tested
 * `error.includes("not configured")`, which breaks the moment the sentence
 * changes).
 */

export type SecurityErrorCode =
  | "unauthenticated"
  | "cross_origin_denied"
  | "method_not_allowed"
  | "rate_limited"
  | "payload_too_large"
  | "invalid_request"
  | "unsupported_file_type"
  | "too_many_pages"
  | "budget_exceeded"
  | "service_unconfigured";

export interface SecurityErrorBody {
  error: string;
  code: SecurityErrorCode;
  /** Seconds to wait. Set for rate-limit and budget responses only. */
  retryAfter?: number;
}

const MESSAGES: Record<SecurityErrorCode, string> = {
  unauthenticated: "Session not recognised. Reload the page and try again.",
  cross_origin_denied: "Request blocked. Reload the page and try again.",
  method_not_allowed: "That action isn't supported here.",
  rate_limited: "Too many uploads in a short time. Please wait and try again.",
  payload_too_large: "That file is too large.",
  invalid_request: "That request wasn't valid. Check the file and try again.",
  unsupported_file_type: "Unsupported file. Upload a PDF, JPEG, PNG or WebP.",
  too_many_pages: "That document has too many pages to process in one upload.",
  budget_exceeded:
    "The monthly document-processing limit has been reached. Processing is paused until it resets — contact your administrator.",
  // Deliberately names neither the provider nor the variable. The client
  // branches on the `code`, so the wording carries no load.
  service_unconfigured:
    "Le traitement des documents n'est pas disponible. Contacte l'administrateur.",
};

/**
 * Words that must never reach the client. `mistral` matters most: the routes
 * are careful, but a future edit that echoes an AiError would leak both the
 * provider and our account's state with it.
 */
const LEAK_PATTERNS: RegExp[] = [
  /mistral/i,
  /api[_-]?key/i,
  /supabase/i,
  /postgres/i,
  /service[_-]?role/i,
  /\bselect\b.*\bfrom\b/i,
  /\bat\s+\w+\s+\(.*:\d+:\d+\)/, // stack frame
  /\/(?:home|var|usr|root)\//, // filesystem path
  /node_modules/,
];

export function securityError(
  code: SecurityErrorCode,
  retryAfter?: number
): SecurityErrorBody {
  const body: SecurityErrorBody = { error: MESSAGES[code], code };
  if (typeof retryAfter === "number" && retryAfter > 0) {
    body.retryAfter = Math.ceil(retryAfter);
  }
  return body;
}

export function statusForCode(code: SecurityErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "cross_origin_denied":
      return 403;
    case "method_not_allowed":
      return 405;
    case "rate_limited":
      return 429;
    case "payload_too_large":
    case "too_many_pages":
      return 413;
    case "invalid_request":
    case "unsupported_file_type":
      return 400;
    case "budget_exceeded":
      return 402;
    case "service_unconfigured":
      return 500;
  }
}

/** True if a message carries infrastructure detail. Used by tests. */
export function containsLeak(message: string): boolean {
  return LEAK_PATTERNS.some((re) => re.test(message));
}

export function allSecurityMessages(): string[] {
  return Object.values(MESSAGES);
}
