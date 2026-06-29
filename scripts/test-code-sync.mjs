/**
 * Integration harness — proves the CODE + SYNC chain end-to-end against the
 * (build/test) Supabase project. Round-trip-or-fail: every step asserts live
 * state and the script exits non-zero on any failure (no "trust the log").
 *
 * Secrets come from the ENV (never hardcoded — the anon key is a JWT and the
 * secret-guard hook would block it anyway). Run when the project is ACTIVE:
 *
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_ANON_KEY="<anon>" \
 *   DEMO_CODE_STAFF="DEMO-STAFF-1234" \
 *   DEMO_CODE_OTHER="TWO-STAFF-5555" \
 *   node scripts/test-code-sync.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const CODE = process.env.DEMO_CODE_STAFF;
const OTHER = process.env.DEMO_CODE_OTHER; // optional — enables the isolation check

function need(name, v) { if (!v) { console.error(`✗ missing env ${name}`); process.exit(2); } }
need("SUPABASE_URL", URL);
need("SUPABASE_ANON_KEY", ANON);
need("DEMO_CODE_STAFF", CODE);

const pass = (m) => console.log("  ✅ " + m);
const fail = (m) => { console.error("  ❌ " + m); process.exitCode = 1; };
const sessionClient = (token) =>
  createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });

async function authLocation(code) {
  const r = await fetch(`${URL}/functions/v1/auth-location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ code }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const run = async () => {
  let insertedId = null;
  let staff = null;

  console.log("1) CODE → SESSION");
  const a = await authLocation(CODE);
  if (a.status !== 200 || !a.body.access_token) {
    fail(`auth-location failed: ${a.status} ${JSON.stringify(a.body)}`);
  } else {
    staff = a.body;
    pass(`code authenticated → "${staff.location_name}" (${staff.location_id}), role=${staff.role}`);
  }

  console.log("2) WRONG CODE → DENIED");
  const bad = await authLocation("NOPE-0000-XXXX");
  bad.status === 401 ? pass("invalid code rejected (401)") : fail(`expected 401, got ${bad.status} ${JSON.stringify(bad.body)}`);

  if (staff) {
    console.log("3) SYNC: write → read back (round-trip) as the location session");
    const sb = sessionClient(staff.access_token);
    const probe = `HARNESS-${Date.now()}`;
    const ins = await sb.from("clients").insert({ location_id: staff.location_id, room_number: "999", name: probe }).select("id,name").single();
    if (ins.error) {
      fail(`insert failed: ${ins.error.message}`);
    } else {
      insertedId = ins.data.id;
      pass(`inserted client ${insertedId}`);
      const read = await sb.from("clients").select("id,name").eq("id", insertedId).maybeSingle();
      read.data?.name === probe ? pass("round-trip read matches what we wrote") : fail(`round-trip mismatch: ${JSON.stringify(read.data)}`);
    }

    console.log("4) ISOLATION: a different location cannot see it");
    if (OTHER) {
      const o = await authLocation(OTHER);
      if (o.status === 200 && o.body.access_token) {
        const sbO = sessionClient(o.body.access_token);
        const cross = await sbO.from("clients").select("id").eq("id", insertedId).maybeSingle();
        !cross.data ? pass("other location sees 0 rows (RLS isolation holds)") : fail("LEAK: other location read the row!");
      } else {
        fail(`second code auth failed: ${o.status} ${JSON.stringify(o.body)}`);
      }
    } else {
      console.log("  (skip — set DEMO_CODE_OTHER to test cross-tenant isolation)");
    }

    console.log("5) ANON: no session reads nothing (deny-by-default)");
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const anonRead = await anon.from("clients").select("id").limit(1);
    (anonRead.error || (anonRead.data?.length ?? 0) === 0) ? pass("anon reads nothing") : fail(`anon read ${anonRead.data.length} row(s)!`);

    // cleanup the probe row (best-effort)
    if (insertedId) await sb.from("clients").delete().eq("id", insertedId);
  }

  console.log(process.exitCode ? "\n❌ CODE + SYNC HARNESS FAILED" : "\n✅ CODE + SYNC HARNESS GREEN — code→session→write→round-trip→isolation→anon-deny");
  process.exit(process.exitCode || 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
