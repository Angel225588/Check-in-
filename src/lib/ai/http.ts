/**
 * Hardened transport for every AI call: timeout, bounded retry with
 * exponential backoff + jitter, and no-secret error messages.
 *
 * Retry policy is deliberately narrow — 429 and 5xx only. A 4xx is a bug in
 * our request; retrying it just burns quota and delays the real error.
 */
import { AI_CONFIG } from "./config";

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const RETRYABLE = (status: number) => status === 429 || status === 408 || status >= 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backoff honouring Retry-After when the server sends it, else exponential
 * with full jitter (avoids a thundering herd when several photos are uploaded
 * at once and all hit the rate limit together).
 */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number.parseFloat(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(secs * 1000, AI_CONFIG.backoffCapMs);
    }
  }
  const exp = Math.min(AI_CONFIG.backoffBaseMs * 2 ** attempt, AI_CONFIG.backoffCapMs);
  return Math.random() * exp; // full jitter
}

/**
 * POST JSON to the Mistral API with timeout + retry. Returns the parsed body.
 * Throws AiError (never containing the API key) on definitive failure.
 */
export async function postJson<T>(
  path: string,
  body: unknown,
  opts: { apiKey: string; timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const url = `${AI_CONFIG.baseUrl}${path}`;
  const payload = JSON.stringify(body);

  // Input guard: refuse rather than silently send an oversized request.
  if (payload.length > AI_CONFIG.maxInputChars * 2) {
    throw new AiError(
      `Request body exceeds the configured input cap (${payload.length} bytes)`,
      413,
      false,
    );
  }

  let lastErr: AiError | null = null;

  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), opts.timeoutMs);

    // Caller cancellation (client disconnect) aborts too, so we don't keep
    // paying for a generation nobody is waiting for.
    const onAbort = () => timer.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
        signal: timer.signal,
      });

      if (res.ok) return (await res.json()) as T;

      // Body may carry a useful message; it must never be echoed to the client
      // verbatim (could contain request fragments), so callers log it safely.
      const text = await res.text().catch(() => "");
      const retryable = RETRYABLE(res.status);
      lastErr = new AiError(
        `Mistral ${path} failed: HTTP ${res.status}${text ? ` — ${text.slice(0, 300)}` : ""}`,
        res.status,
        retryable,
      );
      if (!retryable || attempt === AI_CONFIG.maxRetries) throw lastErr;

      await sleep(backoffMs(attempt, res.headers.get("retry-after")));
    } catch (err) {
      if (err instanceof AiError) {
        if (!err.retryable || attempt === AI_CONFIG.maxRetries) throw err;
        lastErr = err;
      } else {
        // Abort (timeout or client disconnect) and network faults are transient.
        const aborted = (err as Error)?.name === "AbortError";
        const caller = opts.signal?.aborted;
        if (aborted && caller) throw new AiError("Request cancelled", 499, false);

        lastErr = new AiError(
          aborted ? `Timed out after ${opts.timeoutMs}ms` : `Network error: ${(err as Error)?.message ?? "unknown"}`,
          aborted ? 504 : 502,
          true,
        );
        if (attempt === AI_CONFIG.maxRetries) throw lastErr;
        await sleep(backoffMs(attempt, null));
      }
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastErr ?? new AiError("Unknown AI transport failure", 502, false);
}
