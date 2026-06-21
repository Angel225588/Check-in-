// Divergence detector: during the dual-write parallel run, compare localStorage
// vs Supabase and FLAG mismatches (never throw, never fail). localStorage stays
// the source of truth; this only tells us whether sync is trustworthy yet.
import type { Client, CheckInRecord } from "../types";

export interface FieldMismatch {
  id: string;
  field: string;
  local: unknown;
  server: unknown;
}

export interface EntityDivergence {
  local: number; // non-deleted count
  server: number; // non-deleted count
  mismatches: FieldMismatch[];
  orphansLocal: string[]; // ids present (live) locally only
  orphansServer: string[]; // ids present (live) on server only
}

export interface DivergenceReport {
  ok: boolean;
  divergenceCount: number;
  clients: EntityDivergence;
  checkins: EntityDivergence;
}

const live = <T extends { deletedAt?: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deletedAt);

function diffEntity<T extends { id?: string; deletedAt?: string | null }>(
  localRows: T[],
  serverRows: T[],
  fields: (keyof T)[]
): EntityDivergence {
  const localLive = live(localRows);
  const serverLive = live(serverRows);
  const localById = new Map(localLive.map((r) => [r.id ?? "", r]));
  const serverById = new Map(serverLive.map((r) => [r.id ?? "", r]));

  const mismatches: FieldMismatch[] = [];
  const orphansLocal: string[] = [];
  const orphansServer: string[] = [];

  for (const [id, l] of localById) {
    const s = serverById.get(id);
    if (!s) {
      orphansLocal.push(id);
      continue;
    }
    for (const f of fields) {
      if (l[f] !== s[f]) {
        mismatches.push({ id, field: String(f), local: l[f], server: s[f] });
      }
    }
  }
  for (const [id] of serverById) {
    if (!localById.has(id)) orphansServer.push(id);
  }

  return {
    local: localLive.length,
    server: serverLive.length,
    mismatches,
    orphansLocal,
    orphansServer,
  };
}

export function detectDivergence(input: {
  localClients: Client[];
  serverClients: Client[];
  localCheckins: CheckInRecord[];
  serverCheckins: CheckInRecord[];
}): DivergenceReport {
  const clients = diffEntity(input.localClients, input.serverClients, [
    "name", "roomNumber", "isVip", "adults", "children",
  ]);
  const checkins = diffEntity(input.localCheckins, input.serverCheckins, [
    "peopleEntered", "roomNumber", "paymentAction",
  ]);

  const divergenceCount =
    Math.abs(clients.local - clients.server) +
    clients.mismatches.length +
    clients.orphansLocal.length +
    clients.orphansServer.length +
    Math.abs(checkins.local - checkins.server) +
    checkins.mismatches.length +
    checkins.orphansLocal.length +
    checkins.orphansServer.length;

  return { ok: divergenceCount === 0, divergenceCount, clients, checkins };
}
