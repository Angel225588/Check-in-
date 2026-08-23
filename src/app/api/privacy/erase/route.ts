/**
 * Art. 17 / 28(3)(g) — erase all data for one guest, or for a whole property.
 *
 * HONEST STATUS. Guest data currently lives in localStorage on the reception
 * device (docs/GDPR-AUDIT.md §0), so the working implementation is the
 * client-side one in `src/lib/privacy/subject-rights.ts`, reachable from the
 * app. This route is the server-side half, live as soon as Supabase is
 * configured. Until then it answers 503 rather than 200 — reporting a
 * successful erasure that did not happen is the single worst failure available
 * to this endpoint, because the hotel would then tell the guest it was done.
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
          "Run the erasure from the app (Settings → Privacy), which clears the " +
          "device stores directly. This endpoint becomes live when Supabase is configured.",
        storageModel: "device-local",
      },
      { status: 503 }
    );
  }

  try {
    // Server-side path, for when data lives in Supabase. Deliberately not
    // implemented against a database that does not exist yet — and an erasure
    // handler in particular must be written against the real RLS policies in
    // supabase/schema.sql, or it will happily delete across tenants.
    return NextResponse.json({ error: "not_implemented" }, { status: 501 });
  } catch (e) {
    console.error(safeLogError("privacy/erase", e));
    return NextResponse.json({ error: "erase_failed" }, { status: 500 });
  }
}
