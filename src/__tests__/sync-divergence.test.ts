import { describe, it, expect } from "vitest";
import { detectDivergence } from "../lib/sync/divergence";
import { evaluateCutoverGate, type DivergenceSnapshot } from "../lib/sync/cutover-gate";
import type { Client, CheckInRecord } from "../lib/types";

function client(over: Partial<Client>): Client {
  return {
    id: "id-1", roomNumber: "101", roomType: "", rtc: "", confirmationNumber: "",
    name: "Alice", arrivalDate: "", departureDate: "", reservationStatus: "",
    adults: 1, children: 0, rateCode: "", packageCode: "", isVip: false, ...over,
  };
}
const noCheckins = { localCheckins: [] as CheckInRecord[], serverCheckins: [] as CheckInRecord[] };

describe("divergence detector (flag, never fail)", () => {
  it("ok:true when local and server match", () => {
    const r = detectDivergence({
      localClients: [client({ id: "a" })],
      serverClients: [client({ id: "a" })],
      ...noCheckins,
    });
    expect(r.ok).toBe(true);
    expect(r.divergenceCount).toBe(0);
  });

  it("flags a field mismatch", () => {
    const r = detectDivergence({
      localClients: [client({ id: "a", name: "Alice" })],
      serverClients: [client({ id: "a", name: "Alicia" })],
      ...noCheckins,
    });
    expect(r.ok).toBe(false);
    expect(r.clients.mismatches[0]).toMatchObject({ id: "a", field: "name" });
  });

  it("flags orphans on each side", () => {
    const r = detectDivergence({
      localClients: [client({ id: "a" })],
      serverClients: [client({ id: "b" })],
      ...noCheckins,
    });
    expect(r.clients.orphansLocal).toContain("a");
    expect(r.clients.orphansServer).toContain("b");
    expect(r.ok).toBe(false);
  });

  it("treats a remote tombstone as absent (no false divergence)", () => {
    const r = detectDivergence({
      localClients: [], // we deleted it locally too / it's gone
      serverClients: [client({ id: "a", deletedAt: "2026-06-21T00:00:00Z" })],
      ...noCheckins,
    });
    expect(r.ok).toBe(true); // tombstone not counted
  });

  it("never throws on empty inputs", () => {
    expect(() => detectDivergence({ localClients: [], serverClients: [], ...noCheckins })).not.toThrow();
  });
});

describe("cutover gate (GO only on 48h all-zero + drained)", () => {
  const T = 1_000_000_000_000;
  const H = 60 * 60 * 1000;

  it("HOLD when less than 48h of history", () => {
    const snaps: DivergenceSnapshot[] = [{ ts: T - 1 * H, count: 0, outboxLen: 0 }];
    expect(evaluateCutoverGate(snaps, T).decision).toBe("HOLD");
  });

  it("HOLD when any in-window snapshot has divergence", () => {
    const snaps: DivergenceSnapshot[] = [
      { ts: T - 49 * H, count: 0, outboxLen: 0 },
      { ts: T - 10 * H, count: 3, outboxLen: 0 },
    ];
    expect(evaluateCutoverGate(snaps, T).decision).toBe("HOLD");
  });

  it("HOLD when outbox never observed drained", () => {
    const snaps: DivergenceSnapshot[] = [
      { ts: T - 49 * H, count: 0, outboxLen: 2 },
      { ts: T - 5 * H, count: 0, outboxLen: 1 },
    ];
    expect(evaluateCutoverGate(snaps, T).decision).toBe("HOLD");
  });

  it("GO on full 48h all-zero divergence with a drained outbox", () => {
    const snaps: DivergenceSnapshot[] = [
      { ts: T - 49 * H, count: 0, outboxLen: 0 },
      { ts: T - 24 * H, count: 0, outboxLen: 0 },
      { ts: T - 1 * H, count: 0, outboxLen: 0 },
    ];
    const d = evaluateCutoverGate(snaps, T);
    expect(d.decision).toBe("GO");
  });
});
