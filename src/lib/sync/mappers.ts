// Pure, sole owner of the camelCase <-> snake_case column contract.
// Mappers never send server-managed columns (created_at, checked_in_by, server
// updated_at) and omit breakfast_included on insert (DB default).
import type { Client, CheckInRecord, DailyData } from "../types";
import type { Tables, TablesInsert } from "../database.types";
import { getDeviceId } from "./config";
import { clientLocalKey } from "./ids";

export interface MapCtx {
  locationId: string;
  sessionId?: string | null;
}

export function clientToRow(c: Client, ctx: MapCtx): TablesInsert<"clients"> {
  return {
    id: c.id,
    location_id: ctx.locationId,
    session_id: ctx.sessionId ?? null,
    client_local_key: c.clientLocalKey ?? clientLocalKey(c),
    client_rev: c.clientRev ?? 0,
    device_id: c.deviceId ?? getDeviceId(),
    deleted_at: c.deletedAt ?? null,
    room_number: c.roomNumber,
    name: c.name,
    room_type: c.roomType ?? null,
    rtc: c.rtc ?? "",
    confirmation_number: c.confirmationNumber ?? "",
    arrival_date: c.arrivalDate ?? "",
    departure_date: c.departureDate ?? "",
    reservation_status: c.reservationStatus ?? "",
    rate_code: c.rateCode ?? "",
    package_code: c.packageCode ?? null,
    pending_payment_action: c.pendingPaymentAction ?? null,
    is_vip: c.isVip ?? false,
    vip_level: c.vipLevel ?? null,
    vip_notes: c.vipNotes ?? "",
    vip_source: c.vipSource ?? null,
    adults: c.adults ?? 0,
    children: c.children ?? 0,
  };
}

export function rowToClient(row: Tables<"clients">): Client {
  return {
    id: row.id,
    clientLocalKey: row.client_local_key ?? undefined,
    clientRev: row.client_rev,
    serverUpdatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id ?? undefined,
    roomNumber: row.room_number,
    name: row.name,
    roomType: row.room_type ?? "",
    rtc: row.rtc,
    confirmationNumber: row.confirmation_number,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    reservationStatus: row.reservation_status,
    rateCode: row.rate_code,
    packageCode: row.package_code ?? "",
    pendingPaymentAction: row.pending_payment_action ?? undefined,
    isVip: row.is_vip,
    vipLevel: row.vip_level ?? "",
    vipNotes: row.vip_notes,
    vipSource: (row.vip_source as Client["vipSource"]) ?? undefined,
    adults: row.adults,
    children: row.children,
  };
}

export function checkinToRow(ci: CheckInRecord, ctx: MapCtx): TablesInsert<"checkins"> {
  return {
    id: ci.id,
    location_id: ctx.locationId,
    session_id: ctx.sessionId ?? null,
    client_rev: ci.clientRev ?? 0,
    device_id: ci.deviceId ?? getDeviceId(),
    deleted_at: ci.deletedAt ?? null,
    room_number: ci.roomNumber,
    client_name: ci.clientName,
    people_entered: ci.peopleEntered,
    payment_action: ci.paymentAction ?? null,
    checked_in_at: ci.timestamp,
  };
}

export function rowToCheckin(row: Tables<"checkins">): CheckInRecord {
  return {
    id: row.id,
    clientRev: row.client_rev,
    serverUpdatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id ?? undefined,
    roomNumber: row.room_number ?? "",
    clientName: row.client_name ?? "",
    peopleEntered: row.people_entered,
    paymentAction: row.payment_action ?? undefined,
    timestamp: row.checked_in_at,
  };
}

// Sessions upsert on the business key (location_id, service_date), never the PK.
export function sessionToRow(
  d: DailyData,
  ctx: MapCtx,
  extra: { status?: string; totals?: Record<string, unknown>; closedAt?: string | null } = {}
): TablesInsert<"sessions"> {
  return {
    location_id: ctx.locationId,
    service_date: d.date,
    status: extra.status ?? "open",
    totals: (extra.totals ?? {}) as TablesInsert<"sessions">["totals"],
    raw_upload_text: d.rawUploadText ?? null,
    closed_at: extra.closedAt ?? null,
    client_rev: d.sessionRev ?? 0,
    device_id: getDeviceId(),
  };
}
