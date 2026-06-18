// admin-provision — bootstrap-token-guarded provisioning of a location:
// creates the location, one auth user per role (location_id + role baked into
// app_metadata), and peppered access codes. Returns nothing sensitive.
// Run during onboarding only. Guard token's sha256 lives in app_config.
import { createClient } from "npm:@supabase/supabase-js@2";

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

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function randHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: {
    bootstrap_token?: string;
    location_name?: string;
    slug?: string;
    codes?: { role: "manager" | "staff"; code: string; label?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  // Verify bootstrap token against stored sha256
  const { data: cfg } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "bootstrap_token_sha256")
    .maybeSingle();
  if (!cfg?.value) return json({ error: "bootstrap_not_configured" }, 500);
  const provided = await sha256Hex((body.bootstrap_token ?? "").trim());
  if (provided !== cfg.value) return json({ error: "unauthorized" }, 401);

  if (!body.location_name || !body.codes?.length) {
    return json({ error: "missing_fields" }, 400);
  }

  // Ensure a pepper exists (generated once, server-only)
  let pepper = Deno.env.get("LOCATION_CODE_PEPPER") ?? "";
  if (!pepper) {
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "location_code_pepper")
      .maybeSingle();
    pepper = data?.value ?? "";
    if (!pepper) {
      pepper = randHex(32);
      await admin.from("app_config").insert({ key: "location_code_pepper", value: pepper });
    }
  }

  // Create the location
  const { data: loc, error: locErr } = await admin
    .from("locations")
    .insert({ name: body.location_name, slug: body.slug ?? null })
    .select("id, name")
    .single();
  if (locErr || !loc) return json({ error: "location_failed", detail: locErr?.message }, 500);

  const created: { role: string; label?: string }[] = [];
  for (const c of body.codes) {
    const email = `loc_${loc.id}_${c.role}@loc.imarketin.app`;
    // Create (or reuse) the role's service user with claims in app_metadata
    const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
      email,
      password: randHex(24),
      email_confirm: true,
      app_metadata: { location_id: loc.id, user_role: c.role },
    });
    if (userErr || !userRes?.user) {
      return json({ error: "user_failed", detail: userErr?.message }, 500);
    }
    await admin.from("location_members").insert({
      user_id: userRes.user.id,
      location_id: loc.id,
      role: c.role,
      label: c.label ?? null,
    });
    const codeHash = await hmacHex(pepper, c.code.trim());
    const { error: codeErr } = await admin.from("location_codes").insert({
      location_id: loc.id,
      role: c.role,
      code_hash: codeHash,
      auth_user_id: userRes.user.id,
      auth_email: email,
      label: c.label ?? null,
    });
    if (codeErr) return json({ error: "code_failed", detail: codeErr.message }, 500);
    created.push({ role: c.role, label: c.label });
  }

  return json({ location_id: loc.id, location_name: loc.name, codes: created });
});
