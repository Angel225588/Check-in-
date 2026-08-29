/**
 * Route-level guard: the checks that need the request body.
 *
 * The middleware handles same-origin, method, identity and rate limiting
 * before a request reaches a route. This module handles what it cannot see
 * from headers alone — the real byte length, the file's actual type, and the
 * budget reservation.
 */

import { NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import {
  getPropertyCode,
  type RoutePolicy,
  type AllowedUploadType,
} from "./config";
import { securityError, statusForCode, type SecurityErrorCode } from "./errors";
import { validateFileBytes, isTypeMismatch } from "./magic-bytes";
import {
  getLedger,
  reserve,
  commit,
  release,
  worstCaseCost,
  type Reservation,
} from "./budget";
import { SESSION_COOKIE, verifySession } from "./identity";

/** An error response carrying a stable code and no infrastructure detail. */
export function guardError(
  code: SecurityErrorCode,
  retryAfter?: number
): NextResponse {
  const body = securityError(code, retryAfter);
  const res = NextResponse.json(body, { status: statusForCode(code) });
  if (body.retryAfter) res.headers.set("Retry-After", String(body.retryAfter));
  return res;
}

/**
 * Which property to bill. The middleware already validated the cookie; this
 * only reads the scope back out, falling back to the configured default.
 */
export async function resolvePropertyCode(request: Request): Promise<string> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  if (!match) return getPropertyCode();
  const session = await verifySession(decodeURIComponent(match[1]));
  return session?.propertyCode ?? getPropertyCode();
}

export interface AiBudgetHold {
  propertyCode: string;
  reservation: Reservation;
}

export type BudgetOutcome =
  | { ok: true; hold: AiBudgetHold }
  | { ok: false; response: NextResponse };

/**
 * Reserve this route's worst-case spend before calling the provider.
 *
 * The caller MUST settle the hold with `settleOk` or `settleFailed`, or the
 * worst-case amount stays reserved for the rest of the month. `finally` is the
 * right place for it.
 */
export async function holdBudget(
  request: Request,
  policy: RoutePolicy,
  worstCaseOverride?: number
): Promise<BudgetOutcome> {
  const propertyCode = await resolvePropertyCode(request);
  const amount = worstCaseOverride ?? worstCaseCost(policy.worstCase);

  const reservation = await reserve(getLedger(), { propertyCode, amount });

  if (!reservation.ok) {
    console.error(
      safeLogError("AI spend blocked", `${reservation.reason} property=${propertyCode}`)
    );
    return {
      ok: false,
      response: guardError("budget_exceeded", reservation.retryAfter),
    };
  }

  return { ok: true, hold: { propertyCode, reservation } };
}

/** Reconcile the hold against what the request actually cost. */
export async function settleOk(hold: AiBudgetHold, actualCost: number): Promise<void> {
  await commit(getLedger(), hold.reservation, actualCost);
}

/** Release the hold — the call failed, so nothing was spent. */
export async function settleFailed(hold: AiBudgetHold): Promise<void> {
  await release(getLedger(), hold.reservation);
}

export interface ReadFileResult {
  ok: boolean;
  bytes?: Buffer;
  /** Type detected from content. Forward THIS upstream, never `file.type`. */
  detectedType?: AllowedUploadType;
  code?: SecurityErrorCode;
}

/**
 * Read an upload with a hard byte ceiling and validate it by content.
 *
 * `file.size` is checked first as a cheap rejection, then the real byte length
 * is checked again after reading — `size` is metadata, the bytes are the truth.
 */
export async function readValidatedFile(
  file: File,
  policy: RoutePolicy,
  budgetBytes: number = policy.maxBodyBytes
): Promise<ReadFileResult> {
  if (file.size > budgetBytes) return { ok: false, code: "payload_too_large" };

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) return { ok: false, code: "invalid_request" };
  if (buffer.byteLength > budgetBytes) {
    return { ok: false, code: "payload_too_large" };
  }

  const check = validateFileBytes(new Uint8Array(buffer), policy.allowedTypes);
  if (!check.ok) {
    if (isTypeMismatch(file.type, check.detected)) {
      // Log the spoof attempt, but never the file name — it is caller input
      // and can carry a guest's name.
      console.error(
        safeLogError(
          "Upload rejected",
          `claimed=${file.type} detected=${check.detected ?? "unknown"}`
        )
      );
    }
    return { ok: false, code: "unsupported_file_type" };
  }

  return {
    ok: true,
    bytes: Buffer.from(buffer),
    detectedType: check.detected as AllowedUploadType,
  };
}

/**
 * Read a JSON body with the ceiling enforced on real bytes.
 *
 * `content-length` is a client-supplied hint that may be absent or a lie, so
 * it is only a fast-path rejection; the consumed body is what counts.
 */
export async function readJsonBody<T>(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; body: T } | { ok: false; code: SecurityErrorCode }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, code: "payload_too_large" };
  }

  const raw = await request.arrayBuffer();
  if (raw.byteLength > maxBytes) return { ok: false, code: "payload_too_large" };
  if (raw.byteLength === 0) return { ok: false, code: "invalid_request" };

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(raw)) as T };
  } catch {
    return { ok: false, code: "invalid_request" };
  }
}
