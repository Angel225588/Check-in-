/**
 * Central AI configuration. Every model id, timeout, retry and token cap lives
 * here so a future provider/model change is a one-file edit — never another
 * scatter-hunt through the API routes.
 *
 * Model ids are pinned (not `-latest`) and env-overridable. Pinning is
 * deliberate: Mistral retires versioned models on a published schedule (OCR 2
 * was retired 2026-05-31), and a silently-moving alias is exactly how a
 * working extraction pipeline breaks overnight with no code change.
 * Verified against `GET https://api.mistral.ai/v1/models` on 2026-08-15.
 */

const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Values are read through getters, not captured at module load. On a
 * serverless platform the module can be imported before the environment is
 * fully resolved, and a config frozen at import would silently ignore an
 * override that was set correctly.
 */
export const AI_CONFIG = {
  /** EU-hosted (Paris). The only cloud AI provider guest PII is sent to. */
  get baseUrl() {
    return process.env.MISTRAL_BASE_URL || "https://api.mistral.ai";
  },

  /**
   * OCR model. Returns markdown tables which a deterministic parser turns into
   * Client[] — no LLM in the extraction path, so room numbers and guest names
   * cannot be hallucinated.
   */
  get ocrModel() {
    return process.env.MISTRAL_OCR_MODEL || "mistral-ocr-4-1";
  },

  /**
   * Chat model, used ONLY where the task is genuinely semantic (morning brief,
   * extraction verification) — never for tabular roster extraction.
   */
  get chatModel() {
    return process.env.MISTRAL_CHAT_MODEL || "mistral-large-2512";
  },

  /** Per-request wall-clock budget. OCR is slower (large scanned PDFs). */
  get ocrTimeoutMs() {
    return int(process.env.MISTRAL_OCR_TIMEOUT_MS, 90_000);
  },
  get chatTimeoutMs() {
    return int(process.env.MISTRAL_CHAT_TIMEOUT_MS, 60_000);
  },

  /** Retry policy — applied to 429 and 5xx only. Never to 4xx (a bad request
   *  retried is a bad request repeated). */
  get maxRetries() {
    return int(process.env.MISTRAL_MAX_RETRIES, 3);
  },
  get backoffBaseMs() {
    return int(process.env.MISTRAL_BACKOFF_BASE_MS, 500);
  },
  get backoffCapMs() {
    return int(process.env.MISTRAL_BACKOFF_CAP_MS, 8_000);
  },

  /**
   * Hard per-request output token cap. A runaway generation on a dense 15-page
   * roster is the realistic cost incident here, so this is enforced on every
   * chat call rather than left to the caller.
   */
  get maxOutputTokens() {
    return int(process.env.MISTRAL_MAX_OUTPUT_TOKENS, 16_384);
  },

  /**
   * Hard per-request INPUT cap (characters of prompt+document markdown).
   * ~4 chars/token, so 480k chars ≈ 120k tokens. Exceeding it throws rather
   * than silently sending — a truncated roster would lose guests unnoticed.
   */
  get maxInputChars() {
    return int(process.env.MISTRAL_MAX_INPUT_CHARS, 480_000);
  },
};

/** True when a usable Mistral key is configured. */
export function hasMistralKey(): boolean {
  const k = process.env.MISTRAL_API_KEY;
  return !!k && k !== "your_mistral_api_key_here";
}

/** Reads the key, throwing a clear server-side error if absent. */
export function requireMistralKey(): string {
  const k = process.env.MISTRAL_API_KEY;
  if (!k || k === "your_mistral_api_key_here") {
    throw new Error("MISTRAL_API_KEY not configured");
  }
  return k;
}
