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

export const runtime = "nodejs";

function storageConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function POST(request: NextRequest) {
  let body: { scope?: string; guestName?: string; propertyCode?: string; actor?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

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
    // Every export is logged against someone. An anonymous export is not one.
    return NextResponse.json({ error: "actor_required" }, { status: 400 });
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
