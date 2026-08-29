/**
 * Supabase-backed spend ledger.
 *
 * The in-memory ledger binds one instance, so on serverless the real ceiling
 * becomes (cap x instances). This puts the counter in Postgres, where the
 * atomic `ai_spend_add` RPC makes the cap hold across every instance.
 *
 * Errors propagate on purpose: budget.reserve() turns them into a refusal
 * rather than assuming there is room left.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SpendLedgerStore } from "./budget";

export class SupabaseSpendLedger implements SpendLedgerStore {
  constructor(private client: SupabaseClient) {}

  async addAndGet(scope: string, period: string, delta: number): Promise<number> {
    const { data, error } = await this.client.rpc("ai_spend_add", {
      p_scope: scope,
      p_period: period,
      p_delta: delta,
    });
    // The message is deliberately code-only: an error string from the database
    // can carry table and column names, and this one is logged.
    if (error) throw new Error(`ledger_add_failed:${error.code ?? "unknown"}`);
    const total = Number(data);
    if (!Number.isFinite(total)) throw new Error("ledger_add_no_total");
    return total;
  }

  async get(scope: string, period: string): Promise<number> {
    const { data, error } = await this.client
      .from("ai_spend")
      .select("total_usd")
      .eq("scope", scope)
      .eq("period", period)
      .maybeSingle();
    if (error) throw new Error(`ledger_read_failed:${error.code ?? "unknown"}`);
    return Number(data?.total_usd ?? 0);
  }
}

/**
 * Build the ledger from env, or null when it is not configured so the caller
 * falls back to memory. Requires the SERVICE-ROLE key: the anon key ships to
 * every browser and must never be able to move a spend counter.
 */
export function createSupabaseLedgerFromEnv(): SupabaseSpendLedger | null {
  if (process.env.BUDGET_STORE !== "supabase") return null;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return new SupabaseSpendLedger(
    createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  );
}
