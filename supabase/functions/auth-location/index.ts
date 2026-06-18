// auth-location — exchanges a hotel access code for a scoped Supabase session.
// Security: code is matched by peppered HMAC (constant lookup, useless if DB leaks),
// attempts are rate-limited per IP, and the returned JWT carries location_id + role
// in app_metadata (set at provisioning, user-immutable) which RLS enforces.
import { createClient } from "npm:@supabase/supabase-js@2";

const ATTEMPT_WINDOW_MIN = 15;
const ATTEMPT_MAX = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const code = (body.code ?? "").trim();
  if (!code) return json({ error: "missing_code" }, 400);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Rate limit by IP
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MIN * 60_000).toISOString();
  const { count } = await admin
    .from("auth_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("at", since);
  if ((count ?? 0) >= ATTEMPT_MAX) return json({ error: "rate_limited" }, 429);

  // Pepper: prefer env secret (pre-prod), fall back to server-only app_config (test)
  let pepper = Deno.env.get("LOCATION_CODE_PEPPER") ?? "";
  if (!pepper) {
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "location_code_pepper")
      .maybeSingle();
    pepper = data?.value ?? "";
  }
  if (!pepper) return json({ error: "server_misconfigured" }, 500);

  const codeHash = await hmacHex(pepper, code);

  const { data: row } = await admin
    .from("location_codes")
    .select("location_id, role, auth_email, active, locations!inner(id, name, active)")
    .eq("code_hash", codeHash)
    .eq("active", true)
    .maybeSingle();

  const loc = row?.locations as { name?: string; active?: boolean } | undefined;
  const ok = !!row && loc?.active === true;
  await admin.from("auth_attempts").insert({ ip, code_hash: codeHash, ok });

  if (!ok || !row) return json({ error: "invalid_code" }, 401);

  // Mint a real Supabase session for the location's service user (no password stored).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: row.auth_email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: "session_failed", detail: linkErr?.message }, 500);
  }

  const verify = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: v, error: vErr } = await verify.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr || !v?.session) {
    return json({ error: "session_failed", detail: vErr?.message }, 500);
  }

  await admin
    .from("location_codes")
    .update({ last_used_at: new Date().toISOString() })
    .eq("code_hash", codeHash);

  return json({
    access_token: v.session.access_token,
    refresh_token: v.session.refresh_token,
    expires_in: v.session.expires_in,
    location_id: row.location_id,
    role: row.role,
    location_name: loc?.name,
  });
});
