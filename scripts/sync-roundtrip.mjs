// Live round-trip proof of the sync write path:
//   access code -> scoped Supabase session -> authed write under RLS -> read-back -> assert landed.
// Cleans up via the manager code (staff cannot hard-delete clients by design).
import { createClient } from "@supabase/supabase-js";

const URL = "https://qimhmwkmkbqxsvtayldn.supabase.co";
const ANON = "sb_publishable_KHCWvhpw1uq5iRCpES_g0w_-FXtuN-d";
const FN = `${URL}/functions/v1/auth-location`;

async function exchange(code) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error(`auth-location ${code} -> HTTP ${r.status}`);
  return r.json();
}

function client(token) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  return { sb, token };
}

const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT FAILED: " + msg); };

const run = async () => {
  // 1) staff code -> session
  const staff = await exchange("DEMO-STAFF-1234");
  console.log("1) exchanged staff code -> location:", staff.location_name, "role:", staff.role);
  const { sb } = client();
  await sb.auth.setSession({ access_token: staff.access_token, refresh_token: staff.refresh_token });

  // 2) authed write under RLS
  const id = crypto.randomUUID();
  const row = {
    id,
    location_id: staff.location_id,
    room_number: "777",
    name: "Roundtrip Test",
    client_rev: 1,
    client_local_key: "777::ROUNDTRIPTEST",
    device_id: "roundtrip-script",
  };
  const up = await sb.from("clients").upsert(row, { onConflict: "id" });
  assert(!up.error, "upsert error: " + (up.error?.message ?? ""));
  console.log("2) upsert clients row", id, "-> ok");

  // 3) read-back (verifyAfterWrite: landed-not-equal)
  const back = await sb.from("clients").select("id,location_id,name,client_rev,deleted_at").eq("id", id).maybeSingle();
  assert(!back.error, "read-back error: " + (back.error?.message ?? ""));
  assert(back.data, "row did not land (null read)");
  assert(back.data.location_id === staff.location_id, "tenant mismatch");
  assert((back.data.client_rev ?? 0) >= 1, "rev behind ours");
  console.log("3) read-back landed:", JSON.stringify(back.data));

  // 4) monotonic guard live: a lower-rev re-write must NOT win
  await sb.from("clients").update({ name: "SHOULD_NOT_APPLY", client_rev: 0 }).eq("id", id);
  const after = await sb.from("clients").select("name,client_rev").eq("id", id).maybeSingle();
  assert(after.data.name === "Roundtrip Test" && after.data.client_rev === 1, "monotonic guard failed live");
  console.log("4) monotonic guard held live (lower-rev write ignored)");

  // 5) cleanup via manager (staff cannot hard-delete clients)
  const mgr = await exchange("DEMO-MGR-9876");
  const { sb: sbm } = client();
  await sbm.auth.setSession({ access_token: mgr.access_token, refresh_token: mgr.refresh_token });
  const del = await sbm.from("clients").delete().eq("id", id);
  assert(!del.error, "manager delete error: " + (del.error?.message ?? ""));
  const gone = await sbm.from("clients").select("id").eq("id", id).maybeSingle();
  assert(!gone.data, "cleanup failed (row still present)");
  console.log("5) manager cleanup -> row removed");

  console.log("\n✅ LIVE ROUND-TRIP PASS — code -> session -> write -> read-back -> landed, under RLS.");
};

run().catch((e) => { console.error("\n❌", e.message); process.exit(1); });
