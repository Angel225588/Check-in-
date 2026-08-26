/**
 * PROOF THAT HOTEL A CANNOT READ HOTEL B.
 *
 * Runs the real `supabase/schema.sql` against a real Postgres and attacks it as
 * two tenants. Supabase resolves `auth.jwt()` from the `request.jwt.claims`
 * GUC, and `current_property_code()` reads that same GUC, so a plain Postgres
 * is a faithful stand-in — no Docker or Supabase CLI needed, and it runs in CI.
 *
 * Point it at a database with RLS_TEST_DATABASE_URL. Without one the suite
 * skips, and `rls-policy-static.test.ts` — which always runs — is what keeps a
 * permissive policy from reaching main in the meantime.
 *
 *   RLS_TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:rls
 *
 * The view and function coverage is enumerated from pg_catalog rather than
 * hardcoded, so a view or RPC added later is covered by this test the day it is
 * added instead of being silently exempt.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const URL = process.env.RLS_TEST_DATABASE_URL;
const HOTEL_A = "MARRIOTT-PAR-001";
const HOTEL_B = "MARRIOTT-LYS-002";

type Pg = import("pg").Client;
let db: Pg;

/** Run a statement as a tenant: same connection, scoped to the transaction. */
async function asTenant<T>(code: string | null, fn: (c: Pg) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    // `set local` — reverts on commit/rollback, so a leaked claim cannot make a
    // later assertion pass for the wrong reason.
    await db.query("select set_config('request.jwt.claims', $1, true)",
      [code === null ? "" : JSON.stringify({ property_code: code, role: "authenticated" })]);
    await db.query("set local role authenticated");
    const out = await fn(db);
    await db.query("commit");
    return out;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

const suite = URL ? describe : describe.skip;
if (!URL) {
  console.warn(
    "\n  ⚠ RLS ISOLATION TEST SKIPPED — no RLS_TEST_DATABASE_URL.\n" +
    "    Tenant isolation is NOT proven by this run. See docs/GDPR-AUDIT.md §2.\n"
  );
}

suite("RLS — hotel A cannot reach hotel B", () => {
  let seed: { aSession: string; bSession: string; aClient: string; bClient: string };

  beforeAll(async () => {
    const { Client } = await import("pg");
    db = new Client({ connectionString: URL });
    await db.connect();

    // Fresh schema each run so a stale table can never make this pass.
    await db.query("drop schema public cascade; create schema public;");
    // Idempotent: roles are cluster-wide and survive a schema drop, so a
    // plain CREATE ROLE fails on the second run — which would abort beforeAll
    // and silently SKIP every assertion below. A security suite that skips
    // itself is worse than no suite, because the run still reports green.
    for (const role of ["authenticated", "anon"]) {
      await db.query(
        `do $$ begin
           if not exists (select 1 from pg_roles where rolname = '${role}') then
             create role ${role};
           end if;
         end $$;`);
    }
    await db.query("grant usage on schema public to authenticated, anon");
    await db.query(readFileSync(path.resolve(__dirname, "../../supabase/schema.sql"), "utf8"));

    // Seed as the owner, with RLS bypassed only for setup.
    await db.query("set role postgres");
    await db.query("alter table sessions no force row level security");
    await db.query("alter table clients no force row level security");
    await db.query("alter table check_ins no force row level security");
    await db.query("alter table billing_records no force row level security");
    await db.query("alter table pdf_uploads no force row level security");
    await db.query("alter table access_log no force row level security");

    const mk = async (code: string) => {
      const s = await db.query(
        "insert into sessions (date, property_code) values ('2026-08-23', $1) returning id", [code]);
      const sid = s.rows[0].id;
      const c = await db.query(
        `insert into clients (session_id, property_code, room_number, name, adults, package_code)
         values ($1, $2, '412', 'DUPONT, Marie', 2, 'BKF INC') returning id`, [sid, code]);
      await db.query(
        `insert into check_ins (session_id, property_code, room_number, client_name, people_entered)
         values ($1, $2, '412', 'DUPONT, Marie', 2)`, [sid, code]);
      await db.query(
        `insert into billing_records (session_id, property_code, room_number, client_name, action)
         values ($1, $2, '412', 'DUPONT, Marie', 'room_charge')`, [sid, code]);
      await db.query(
        `insert into pdf_uploads (session_id, property_code, file_name)
         values ($1, $2, 'roster.pdf')`, [sid, code]);
      await db.query(
        `insert into access_log (property_code, actor, action, resource)
         values ($1, 'reception', 'view', 'client')`, [code]);
      return { sid, cid: c.rows[0].id };
    };
    const a = await mk(HOTEL_A);
    const b = await mk(HOTEL_B);
    seed = { aSession: a.sid, bSession: b.sid, aClient: a.cid, bClient: b.cid };

    for (const t of ["sessions", "clients", "check_ins", "billing_records", "pdf_uploads", "access_log"]) {
      await db.query(`alter table ${t} force row level security`);
    }
    await db.query("reset role");
  }, 60_000);

  afterAll(async () => { if (db) await db.end(); });

  const DATA_TABLES = ["sessions", "clients", "check_ins", "pdf_uploads", "billing_records", "access_log"];

  it("seeded both hotels — otherwise every assertion below passes vacuously", async () => {
    await db.query("set role postgres");
    await db.query("alter table clients no force row level security");
    const all = await db.query("select property_code from clients");
    await db.query("alter table clients force row level security");
    await db.query("reset role");
    expect(all.rows.map((r) => r.property_code).sort()).toEqual([HOTEL_A, HOTEL_B].sort());
  });

  it.each(DATA_TABLES)("hotel A reads none of hotel B's rows in %s", async (table) => {
    const rows = await asTenant(HOTEL_A, (c) => c.query(`select property_code from ${table}`));
    expect(rows.rowCount, `${table} returned nothing at all — check the seed`).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.property_code === HOTEL_A)).toBe(true);
    expect(rows.rows.some((r) => r.property_code === HOTEL_B)).toBe(false);
  });

  it.each(DATA_TABLES)("a targeted select for a known B row returns nothing from %s", async (table) => {
    const rows = await asTenant(HOTEL_A, (c) =>
      c.query(`select * from ${table} where property_code = $1`, [HOTEL_B]));
    expect(rows.rowCount).toBe(0);
  });

  it("hotel A cannot read hotel B's guest by primary key", async () => {
    const rows = await asTenant(HOTEL_A, (c) =>
      c.query("select name from clients where id = $1", [seed.bClient]));
    expect(rows.rowCount).toBe(0);
  });

  it("hotel A cannot reach B's clients by joining through B's session id", async () => {
    // The join is the shape a hand-written query most easily gets wrong.
    const rows = await asTenant(HOTEL_A, (c) =>
      c.query(`select c.name from clients c join sessions s on s.id = c.session_id
               where s.id = $1`, [seed.bSession]));
    expect(rows.rowCount).toBe(0);
  });

  it("hotel A cannot UPDATE hotel B's rows", async () => {
    const res = await asTenant(HOTEL_A, (c) =>
      c.query("update clients set name = 'HACKED' where id = $1", [seed.bClient]));
    expect(res.rowCount).toBe(0);

    await db.query("set role postgres");
    await db.query("alter table clients no force row level security");
    const check = await db.query("select name from clients where id = $1", [seed.bClient]);
    await db.query("alter table clients force row level security");
    await db.query("reset role");
    expect(check.rows[0].name).toBe("DUPONT, Marie");
  });

  it("hotel A cannot DELETE hotel B's rows", async () => {
    const res = await asTenant(HOTEL_A, (c) =>
      c.query("delete from clients where id = $1", [seed.bClient]));
    expect(res.rowCount).toBe(0);
  });

  it("hotel A cannot INSERT a row stamped as hotel B", async () => {
    // The with-check clause. `using` alone would let this through: A cannot SEE
    // B's rows but could still WRITE into B's tenant — poisoning a roster it
    // cannot read. The trigger overwrites the forged code with A's own, so the
    // row lands in A or not at all; either way nothing appears in B.
    await asTenant(HOTEL_A, (c) =>
      c.query(`insert into clients (session_id, property_code, room_number, name)
               values ($1, $2, '999', 'INJECTED')`, [seed.aSession, HOTEL_B])).catch(() => {});

    await db.query("set role postgres");
    await db.query("alter table clients no force row level security");
    const leaked = await db.query(
      "select 1 from clients where property_code = $1 and name = 'INJECTED'", [HOTEL_B]);
    await db.query("alter table clients force row level security");
    await db.query("reset role");
    expect(leaked.rowCount).toBe(0);
  });

  it("hotel A cannot move its own row into hotel B's tenant", async () => {
    await asTenant(HOTEL_A, (c) =>
      c.query("update clients set property_code = $1 where id = $2", [HOTEL_B, seed.aClient]))
      .catch(() => {});
    const stillMine = await asTenant(HOTEL_A, (c) =>
      c.query("select property_code from clients where id = $1", [seed.aClient]));
    expect(stillMine.rows[0]?.property_code).toBe(HOTEL_A);
  });

  it("an unauthenticated caller with no property claim sees nothing anywhere", async () => {
    for (const table of DATA_TABLES) {
      const rows = await asTenant(null, (c) => c.query(`select * from ${table}`));
      expect(rows.rowCount, `${table} leaked to a caller with no claim`).toBe(0);
    }
  });

  it("a caller claiming a property that does not exist sees nothing", async () => {
    const rows = await asTenant("NOT-A-HOTEL", (c) => c.query("select * from clients"));
    expect(rows.rowCount).toBe(0);
  });

  it("the anon role — whose key ships in the browser bundle — is denied outright", async () => {
    for (const table of DATA_TABLES) {
      await db.query("begin");
      await db.query("set local role anon");
      const attempt = db.query(`select * from ${table}`).then(
        (r) => ({ ok: true as const, n: r.rowCount }),
        (e) => ({ ok: false as const, msg: String(e.message) })
      );
      const res = await attempt;
      await db.query("rollback");
      // Either a hard permission denial (grants revoked) or zero rows (policies).
      // A leak is any row reaching anon.
      if (res.ok) expect(res.n, `anon read rows from ${table}`).toBe(0);
      else expect(res.msg).toMatch(/permission denied/i);
    }
  });

  it("every view in public is security_invoker and leaks nothing", async () => {
    // Enumerated, not hardcoded: a view added next month is covered on the day
    // it is added rather than quietly exempt.
    const views = await db.query(
      `select c.relname,
              coalesce((select option_value from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), 'false') as invoker
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'`);
    expect(views.rowCount, "no views found — update this test if that changed").toBeGreaterThan(0);

    for (const v of views.rows) {
      expect(v.invoker, `view ${v.relname} is not security_invoker — it bypasses RLS`)
        .toMatch(/^(on|true)$/i);
      const rows = await asTenant(HOTEL_A, (c) => c.query(`select * from ${v.relname}`));
      expect(
        rows.rows.every((r: Record<string, unknown>) =>
          !("property_code" in r) || r.property_code === HOTEL_A),
        `view ${v.relname} leaked another tenant's rows`
      ).toBe(true);
    }
  });

  it("no function in public is a security definer bypass", async () => {
    // A security definer function runs as its owner and ignores RLS entirely —
    // the standard way a correctly-policied schema regains a hole.
    const fns = await db.query(
      `select p.proname, p.prosecdef
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`);
    const definers = fns.rows.filter((f) => f.prosecdef).map((f) => f.proname);
    expect(definers, `security definer function(s) present: ${definers.join(", ")}`).toEqual([]);
  });

  it("the tenant helper cannot be tricked by a malformed claim", async () => {
    for (const claim of ["", "not-json", "{}", '{"property_code": null}']) {
      await db.query("begin");
      await db.query("select set_config('request.jwt.claims', $1, true)", [claim]);
      await db.query("set local role authenticated");
      const res = await db.query("select * from clients").then(
        (r) => r.rowCount, () => 0 /* a throw is also a non-leak */);
      await db.query("rollback");
      expect(res, `claim ${JSON.stringify(claim)} leaked rows`).toBe(0);
    }
  });
});
