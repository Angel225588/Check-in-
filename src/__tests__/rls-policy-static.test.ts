/**
 * Static guard on the Supabase policy file.
 *
 * The dynamic proof (`rls-isolation.test.ts`) needs a live Postgres and is
 * therefore skippable. This one is not: it parses `supabase/schema.sql` and
 * runs in the ordinary suite, so re-introducing a permissive policy fails
 * `npx vitest run` on the commit that does it rather than in production.
 *
 * Every assertion here exists because the previous schema shipped
 * `enable row level security` immediately followed by `using (true)` on all
 * five tables — which is functionally identical to no RLS at all, while
 * reading like security in a review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const SQL = readFileSync(path.resolve(__dirname, "../../supabase/schema.sql"), "utf8");

/** Strip `--` line comments so a commented-out example never satisfies — or
 *  trips — an assertion about live SQL. */
const CODE = SQL.split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

/** Every table that holds hotel or guest personal data. */
const TENANT_TABLES = [
  "sessions",
  "clients",
  "check_ins",
  "pdf_uploads",
  "billing_records",
  "access_log",
  "purge_log",
];

describe("Supabase policy file — static guarantees", () => {
  it("enables row level security on every tenant table", () => {
    for (const t of TENANT_TABLES) {
      expect(
        new RegExp(`alter\\s+table\\s+${t}\\s+enable\\s+row\\s+level\\s+security`, "i").test(CODE),
        `RLS not enabled on ${t}`
      ).toBe(true);
    }
  });

  it("carries a not-null property_code on every tenant table", () => {
    for (const t of TENANT_TABLES) {
      const create = CODE.match(new RegExp(`create\\s+table[^;]*?\\b${t}\\s*\\(([\\s\\S]*?)\\);`, "i"));
      expect(create, `no create table found for ${t}`).toBeTruthy();
      expect(
        /property_code\s+text\s+not\s+null/i.test(create![1]),
        `${t} has no "property_code text not null" — nothing to scope a policy by`
      ).toBe(true);
    }
  });

  it("declares no security definer function", () => {
    // A security definer function runs as its owner and ignores RLS — the
    // standard way a correctly-policied schema regains a hole.
    //
    // This assertion exists because the dynamic proof that catches it
    // (`rls-isolation.test.ts`) needs a live Postgres and is skipped without
    // one. A `security definer` on the spend ledger's helper therefore passed
    // every local run and only failed in CI. Checking the file itself closes
    // that gap: the rule now fails on the commit that breaks it.
    const definers = CODE.match(/security\s+definer/gi);
    expect(
      definers,
      `security definer found in schema.sql: ${definers?.join(", ")}`
    ).toBeNull();
  });

  it("contains no permissive policy anywhere", () => {
    // `using (true)` / `with check (true)` is the exact defect this file exists
    // to prevent. Matched loosely so whitespace tricks do not slip past.
    const permissive = CODE.match(/(using|with\s+check)\s*\(\s*true\s*\)/gi);
    expect(permissive, `permissive policy clause(s) found: ${permissive?.join(", ")}`).toBeNull();
  });

  it("scopes every policy by the caller's property claim", () => {
    const policies = CODE.match(/create\s+policy[\s\S]*?;/gi) ?? [];
    expect(policies.length, "no policies defined at all").toBeGreaterThan(0);
    for (const p of policies) {
      expect(
        /current_property_code\s*\(\s*\)/i.test(p),
        `policy does not reference current_property_code(): ${p.slice(0, 90)}…`
      ).toBe(true);
    }
  });

  it("gives every write policy a with-check clause", () => {
    // `using` alone governs which rows are visible, NOT what a write may set.
    // Without `with check`, a tenant can insert or update a row stamped with
    // someone else's property_code — writing across the boundary it cannot read.
    const writes = CODE.match(/create\s+policy[\s\S]*?for\s+(insert|update|all)[\s\S]*?;/gi) ?? [];
    expect(writes.length, "no write policies found").toBeGreaterThan(0);
    for (const p of writes) {
      expect(
        /with\s+check\s*\(/i.test(p),
        `write policy has no with-check clause: ${p.slice(0, 90)}…`
      ).toBe(true);
    }
  });

  it("revokes the anon role, which holds a key shipped to every browser", () => {
    expect(/revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon/i.test(CODE)).toBe(true);
  });

  it("forces RLS on table owners too", () => {
    // A table owner bypasses its own RLS unless FORCE is set. Migrations and
    // any pooled connection running as the owner would otherwise see everything.
    for (const t of TENANT_TABLES) {
      expect(
        new RegExp(`alter\\s+table\\s+${t}\\s+force\\s+row\\s+level\\s+security`, "i").test(CODE),
        `RLS not forced on ${t} — the owner still bypasses it`
      ).toBe(true);
    }
  });

  it("declares the tenant-claim helper as a stable, non-definer function", () => {
    // security definer here would let the function itself become the bypass.
    const fn = CODE.match(/create\s+or\s+replace\s+function\s+current_property_code[\s\S]*?\$\$[\s\S]*?\$\$[^;]*;/i);
    expect(fn, "current_property_code() not defined").toBeTruthy();
    expect(/security\s+definer/i.test(fn![0]), "helper must not be security definer").toBe(false);
  });
});
