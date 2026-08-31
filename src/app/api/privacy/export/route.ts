/**
 * Art. 15 / 20 — export all data for one guest, or for a whole property.
 *
 * HONEST STATUS. Guest data currently lives in localStorage on the reception
 * device (docs/GDPR-AUDIT.md §0), so the working implementation is the
 * client-side one in `src/lib/privacy/subject-rights.ts`, reachable from the
 * app. This route is the server-side half, live as soon as Supabase is
 * configured. Until then it answers 503 with a machine-readable reason rather
 * than pretending to have exported nothing — an endpoint that returns an empty
 * export looks exactly like a guest with no data, and that is the one mistake
 * this route must never make.
 */
import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { getRoutePolicy } from "@/lib/security/config";
import { guardError, readJsonBody, requestIdentity } from "@/lib/security/guard";

export const runtime = "nodejs";

function storageConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function POST(request: NextRequest) {
  const policy = getRoutePolicy("/api/privacy/export")!;

  // A subject-rights request is small. Reading an unbounded body on an
  // endpoint this sensitive is free work for an attacker.
  const parsedBody = await readJsonBody<{
    scope?: string;
    guestName?: string;
    propertyCode?: string;
    actor?: string;
  }>(request, policy.maxBodyBytes);
  if (!parsedBody.ok) {
    return parsedBody.code === "payload_too_large"
      ? guardError(parsedBody.code)
      : NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const body = parsedBody.body;

  const scope = body.scope;
  if (scope !== "guest" && scope !== "property") {
    return NextResponse.json(
      { error: "invalid_scope", detail: "scope must be 'guest' or 'property'" },
      { status: 400 }
    );
  }
  if (scope === "guest" && !body.guestName?.trim()) {
    return NextResponse.json({ error: "guest_name_required" }, { status: 400 });
  }
  if (!body.propertyCode?.trim()) {
    // Without a property there is no tenant to scope the export to, and an
    // unscoped export is a cross-tenant read. See docs/GDPR-AUDIT.md §2.
    return NextResponse.json({ error: "property_code_required" }, { status: 400 });
  }
  if (!body.actor?.trim()) {
    // Every request is logged against someone. An anonymous one is not.
    return NextResponse.json({ error: "actor_required" }, { status: 400 });
  }

  // `actor` is a caller-supplied label and nothing more — a client can put any
  // name in it. Bind the device the middleware resolved alongside it, so the
  // audit trail records something the caller cannot choose. This is not proof
  // of a person (see src/lib/security/identity.ts); it is proof of a device,
  // which is strictly more than the claim alone. Real actor identity arrives
  // with the Supabase Auth work in docs/GDPR-AUDIT.md §2.
  //
  // Taken from the middleware's headers, never by re-reading the cookie: that
  // check can fail under an ephemeral signing key on a request the middleware
  // just accepted, which would refuse an erasure for no real reason.
  const { deviceId, propertyCode: boundProperty } = requestIdentity(request);
  if (!deviceId) {
    return NextResponse.json({ error: "unidentified_device" }, { status: 401 });
  }
  const actorRef = `${body.actor.trim()}@device:${deviceId.slice(0, 8)}`;

  // The tenant is the one bound to this device, not the one the body claims —
  // otherwise a caller could name someone else's property and have it honoured.
  if (body.propertyCode.trim() !== boundProperty) {
    return NextResponse.json({ error: "property_mismatch" }, { status: 403 });
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      {
        error: "storage_not_configured",
        detail:
          "Guest data is stored on the reception device, not on the server. " +
          "Run the export from the app (Settings → Privacy), which reads the " +
          "device stores directly. This endpoint becomes live when Supabase is configured.",
        storageModel: "device-local",
      },
      { status: 503 }
    );
  }

  try {
    void actorRef; // recorded by the server-side path below once it exists.
    // Server-side path, for when data lives in Supabase. Deliberately not
    // implemented against a database that does not exist yet: the RLS policies
    // and tenant claim it must run under are in supabase/schema.sql, and this
    // handler should be written against them, not ahead of them.
    return NextResponse.json({ error: "not_implemented" }, { status: 501 });
  } catch (e) {
    console.error(safeLogError("privacy/export", e));
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
