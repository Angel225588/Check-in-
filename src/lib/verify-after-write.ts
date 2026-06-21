// Round-trip-or-fail. After EVERY push, re-read the live row and prove the write
// LANDED — NOT that the row equals what we sent. A newer LWW winner (higher
// client_rev) means our write landed and then lost LWW: that is SUCCESS, not a
// verify failure. This kills retry storms and false dead-lettering under concurrency.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Transient — the write may not have landed; retry. */
export class VerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyError";
  }
}

/** Permanent (RLS deny / tenant mismatch) — do NOT retry; surface to manager. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface VerifyArgs {
  table: "clients" | "checkins" | "sessions";
  id?: string;
  match?: Record<string, string>; // e.g. sessions: { location_id, service_date }
  ourRev: number;
  expectDeleted?: boolean;
}

export async function verifyAfterWrite(
  sb: SupabaseClient<Database>,
  args: VerifyArgs
): Promise<void> {
  // SEPARATE read of live state — never the write's echo.
  let q = sb.from(args.table).select("id,updated_at,deleted_at,client_rev");
  if (args.id) q = q.eq("id", args.id);
  if (args.match) {
    for (const [k, v] of Object.entries(args.match)) q = q.eq(k, v);
  }
  const { data, error } = await q.maybeSingle();

  if (error) {
    // 42501 = RLS denial; treat as a config error (no retry).
    if ((error as { code?: string }).code === "42501") {
      throw new ConfigError(`RLS denied on ${args.table}: ${error.message}`);
    }
    throw new VerifyError(`read-back failed on ${args.table}: ${error.message}`);
  }
  if (!data) {
    throw new VerifyError(`write did not land on ${args.table} (no row found)`);
  }
  const row = data as { client_rev: number | null; deleted_at: string | null };
  if (args.expectDeleted && !row.deleted_at) {
    throw new VerifyError(`tombstone not present on ${args.table}`);
  }
  // landed-not-equal: our write OR a newer LWW winner is present.
  if ((row.client_rev ?? 0) < args.ourRev) {
    throw new VerifyError(`row rev ${row.client_rev} behind ours ${args.ourRev}`);
  }
}
