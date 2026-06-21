// Bridge between storage.ts mutators and the outbox. Every function is a pure
// no-op when SYNC_ENABLED is false, so the app behaves byte-identically to today
// until the flag is flipped on a test device.
import type { Json } from "../database.types";
import type { Client, CheckInRecord, DailyData } from "../types";
import { SYNC_ENABLED, getDeviceId } from "./config";
import { enqueue } from "./outbox";
import { ensureClientId, clientLocalKey } from "./ids";

/** Stamp a client for sync (id + bumped LWW rev + content key + device). Call before persisting. */
export function stampClient(c: Client): void {
  ensureClientId(c);
  c.clientRev = (c.clientRev ?? 0) + 1;
  c.clientLocalKey = clientLocalKey(c);
  c.deviceId = getDeviceId();
}

export function stampCheckin(ci: CheckInRecord): void {
  ci.clientRev = (ci.clientRev ?? 0) + 1;
  ci.deviceId = getDeviceId();
}

export function onClientUpsert(c: Client, serviceDate: string, sessionId?: string | null, dirty?: string[]): void {
  if (!SYNC_ENABLED) return;
  enqueue({
    entity: "client", op: "upsert", rowId: c.id, dedupeKey: `client:${c.id}`,
    dirtyFields: dirty, serviceDate, deviceId: c.deviceId,
    payload: { ...c, __sessionId: sessionId ?? null } as unknown as Json,
  });
}

export function onClientDelete(c: Client, serviceDate: string): void {
  if (!SYNC_ENABLED) return;
  enqueue({
    entity: "client", op: "delete", rowId: c.id, dedupeKey: `client:${c.id}`,
    serviceDate, deviceId: c.deviceId, payload: { ...c } as unknown as Json,
  });
}

export function onCheckinUpsert(ci: CheckInRecord, serviceDate: string, sessionId?: string | null): void {
  if (!SYNC_ENABLED) return;
  enqueue({
    entity: "checkin", op: "upsert", rowId: ci.id, dedupeKey: `checkin:${ci.id}`,
    serviceDate, deviceId: ci.deviceId,
    payload: { ...ci, __sessionId: sessionId ?? null } as unknown as Json,
  });
}

export function onCheckinDelete(ci: CheckInRecord, serviceDate: string): void {
  if (!SYNC_ENABLED) return;
  enqueue({
    entity: "checkin", op: "delete", rowId: ci.id, dedupeKey: `checkin:${ci.id}`,
    serviceDate, deviceId: ci.deviceId, payload: { ...ci } as unknown as Json,
  });
}

export function onSessionUpsert(
  d: DailyData,
  extra?: { status?: string; totals?: Record<string, unknown>; closedAt?: string | null }
): void {
  if (!SYNC_ENABLED) return;
  d.sessionRev = (d.sessionRev ?? 0) + 1;
  enqueue({
    entity: "session", op: "upsert", dedupeKey: `session:${d.date}`, serviceDate: d.date,
    payload: { ...d, __status: extra?.status, __totals: extra?.totals, __closedAt: extra?.closedAt } as unknown as Json,
  });
}
