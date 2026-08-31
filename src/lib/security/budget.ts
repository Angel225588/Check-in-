/**
 * Monthly AI spend cap — per property and global — that FAILS CLOSED.
 *
 * If the cap is reached, or the ledger cannot be read or written, AI calls are
 * refused with a clear error. It never keeps spending because a check failed.
 *
 * Reserve-then-commit, not check-then-spend. Several uploads that each merely
 * *checked* "am I under the cap?" would all see room and blow through it
 * together. Each request reserves its worst case up front and reconciles to
 * what the provider actually reported; a failed call releases its reservation.
 *
 * Priced to Mistral's billing shape, which is not uniform:
 *   - OCR bills per PAGE. Page count is known locally (pdf-lib) before a byte
 *     is sent, so the reservation uses the real number, not a guess.
 *   - Chat bills per TOKEN.
 *
 * The figures are ESTIMATES for budgeting, not a billing record. Reconcile
 * against the provider console before trusting them.
 */

export interface SpendLedgerStore {
  /** Add delta (may be negative) to a scope's period total; return the total. */
  addAndGet(scope: string, period: string, delta: number): Promise<number>;
  get(scope: string, period: string): Promise<number>;
}

/**
 * Per-instance ledger. Correct for one long-lived server; on serverless each
 * instance counts separately, so the real ceiling is (cap x instances). Set
 * BUDGET_STORE=supabase with the included migration for a cap that holds.
 */
export class MemorySpendLedger implements SpendLedgerStore {
  private totals = new Map<string, number>();
  private key(scope: string, period: string) {
    return `${period}|${scope}`;
  }
  async addAndGet(scope: string, period: string, delta: number): Promise<number> {
    const k = this.key(scope, period);
    const next = (this.totals.get(k) ?? 0) + delta;
    this.totals.set(k, next);
    return next;
  }
  async get(scope: string, period: string): Promise<number> {
    return this.totals.get(this.key(scope, period)) ?? 0;
  }
  reset() {
    this.totals.clear();
  }
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Prices and caps are in ONE currency, EUR by default — the hotel budgets in
 * euros and Mistral is billed in euros. The label is cosmetic; what matters is
 * that the caps and these rates use the same unit. Change both together or the
 * cap means nothing.
 */
export function budgetCurrency(): string {
  return process.env.AI_BUDGET_CURRENCY || "EUR";
}

/** Per OCR page. */
export function ocrPageRate(): number {
  return num(
    process.env.AI_PRICE_OCR_PER_PAGE ?? process.env.AI_PRICE_OCR_PER_PAGE_USD,
    0.001
  );
}
/** Per 1M chat input tokens. */
export function chatInputRate(): number {
  return num(
    process.env.AI_PRICE_CHAT_INPUT_PER_MTOK ??
      process.env.AI_PRICE_CHAT_INPUT_PER_MTOK_USD,
    2.0
  );
}
/** Per 1M chat output tokens. */
export function chatOutputRate(): number {
  return num(
    process.env.AI_PRICE_CHAT_OUTPUT_PER_MTOK ??
      process.env.AI_PRICE_CHAT_OUTPUT_PER_MTOK_USD,
    6.0
  );
}

/**
 * Pessimistic per-chat-call token assumption for the reservation. The output
 * side matches AI_CONFIG.maxOutputTokens, which the transport already caps.
 */
const WORST_CASE_CHAT_INPUT_TOKENS = 120_000;
const WORST_CASE_CHAT_OUTPUT_TOKENS = 16_384;

export function ocrCost(pages: number): number {
  return Math.max(0, pages) * ocrPageRate();
}

export function chatCost(inputTokens: number, outputTokens: number): number {
  return (
    (Math.max(0, inputTokens) / 1_000_000) * chatInputRate() +
    (Math.max(0, outputTokens) / 1_000_000) * chatOutputRate()
  );
}

/** Worst-case cost of one request, from its route policy's ceiling. */
export function worstCaseCost(work: { ocrPages: number; chatCalls: number }): number {
  return (
    ocrCost(work.ocrPages) +
    Math.max(0, work.chatCalls) *
      chatCost(WORST_CASE_CHAT_INPUT_TOKENS, WORST_CASE_CHAT_OUTPUT_TOKENS)
  );
}

/** UTC month key, e.g. "2026-08". */
export function periodKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Seconds until the UTC month rolls over. */
export function secondsUntilPeriodReset(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

export interface BudgetCaps {
  globalMonthlyUsd: number;
  propertyMonthlyUsd: number;
}

/**
 * Monthly ceilings, in the currency above.
 *
 * Defaults are €100 across everything and €50 for any one hotel — the range
 * Angel set. One property therefore cannot spend more than €50 in a month, and
 * the global ceiling leaves headroom for a second without raising the first.
 * A run costing more than the remaining budget is refused, not trimmed.
 *
 * The field names keep their `Usd` suffix so existing callers and the stored
 * ledger do not have to change; the unit is whatever AI_BUDGET_CURRENCY says.
 */
export function getCaps(): BudgetCaps {
  return {
    globalMonthlyUsd: num(
      process.env.AI_MONTHLY_BUDGET ?? process.env.AI_MONTHLY_BUDGET_USD,
      100
    ),
    propertyMonthlyUsd: num(
      process.env.AI_MONTHLY_BUDGET_PER_PROPERTY ??
        process.env.AI_MONTHLY_BUDGET_PER_PROPERTY_USD,
      50
    ),
  };
}

export type BudgetDenialReason =
  | "global_cap_reached"
  | "property_cap_reached"
  | "ledger_unavailable";

export interface Reservation {
  ok: true;
  amount: number;
  propertyCode: string;
  period: string;
}

export interface BudgetDenied {
  ok: false;
  reason: BudgetDenialReason;
  retryAfter: number;
}

export type ReserveResult = Reservation | BudgetDenied;

/**
 * Reserve worst-case spend. Both scopes are incremented before either is
 * judged, so concurrent callers contend on one counter rather than all
 * reading a stale "under budget".
 */
export async function reserve(
  store: SpendLedgerStore,
  opts: { propertyCode: string; amount: number },
  caps: BudgetCaps = getCaps(),
  now: number = Date.now()
): Promise<ReserveResult> {
  const { propertyCode, amount } = opts;
  const period = periodKey(now);
  const propertyScope = `property:${propertyCode}`;

  try {
    const globalTotal = await store.addAndGet("global", period, amount);
    const propertyTotal = await store.addAndGet(propertyScope, period, amount);

    const overGlobal = globalTotal > caps.globalMonthlyUsd;
    const overProperty = propertyTotal > caps.propertyMonthlyUsd;

    if (overGlobal || overProperty) {
      // Roll back, so a denied request does not permanently consume budget
      // it never spent.
      await store.addAndGet("global", period, -amount);
      await store.addAndGet(propertyScope, period, -amount);
      return {
        ok: false,
        reason: overGlobal ? "global_cap_reached" : "property_cap_reached",
        retryAfter: secondsUntilPeriodReset(now),
      };
    }

    return { ok: true, amount, propertyCode, period };
  } catch {
    // Cannot prove we are under budget, so refuse. This is the fail-closed path.
    return { ok: false, reason: "ledger_unavailable", retryAfter: 60 };
  }
}

/** Reconcile a reservation against real usage. */
export async function commit(
  store: SpendLedgerStore,
  reservation: Reservation,
  actualCost: number
): Promise<void> {
  const delta = actualCost - reservation.amount;
  if (delta === 0) return;
  try {
    await store.addAndGet("global", reservation.period, delta);
    await store.addAndGet(
      `property:${reservation.propertyCode}`,
      reservation.period,
      delta
    );
  } catch {
    // Best-effort. The pessimistic reservation stands, which errs toward
    // under-spending rather than over.
  }
}

/** Give back an unused reservation after a failed call. */
export async function release(
  store: SpendLedgerStore,
  reservation: Reservation
): Promise<void> {
  await commit(store, reservation, 0);
}

let sharedLedger: SpendLedgerStore | null = null;

export function getLedger(): SpendLedgerStore {
  if (!sharedLedger) sharedLedger = new MemorySpendLedger();
  return sharedLedger;
}

/** Swap the ledger (Supabase in production, fakes in tests). */
export function setLedger(store: SpendLedgerStore | null): void {
  sharedLedger = store;
}
