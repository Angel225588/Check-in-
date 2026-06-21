import { describe, it, expect } from "vitest";
import { mergePulledClients, mergePulledCheckins, lwwServerWins } from "../lib/sync/pull";
import type { Client, CheckInRecord } from "../lib/types";

function client(over: Partial<Client>): Client {
  return {
    id: "id-1", roomNumber: "101", roomType: "", rtc: "", confirmationNumber: "",
    name: "Alice", arrivalDate: "", departureDate: "", reservationStatus: "",
    adults: 1, children: 0, rateCode: "", packageCode: "",
    clientRev: 0, deviceId: "devA", serverUpdatedAt: "2026-06-21T00:00:00Z", ...over,
  };
}
const none = new Set<string>();

describe("pull merge — LWW + tombstones (convergence)", () => {
  it("higher server rev wins; lower server rev is ignored", () => {
    const local = [client({ id: "x", name: "LOCAL", clientRev: 5 })];
    const win = mergePulledClients(local, [client({ id: "x", name: "SERVER", clientRev: 9 })], none);
    expect(win[0].name).toBe("SERVER");
    const lose = mergePulledClients(local, [client({ id: "x", name: "SERVER", clientRev: 2 })], none);
    expect(lose[0].name).toBe("LOCAL");
  });

  it("equal rev: a server tombstone beats a local edit", () => {
    const local = [client({ id: "x", name: "LOCAL", clientRev: 5, deletedAt: null })];
    const merged = mergePulledClients(local, [client({ id: "x", clientRev: 5, deletedAt: "2026-06-21T08:00:00Z" })], none);
    expect(merged[0].deletedAt).toBeTruthy(); // kept as tombstone, not removed
    expect(merged).toHaveLength(1);
  });

  it("equal rev, no tombstone: greater device_id wins (deterministic tiebreak)", () => {
    expect(lwwServerWins({ clientRev: 5, deviceId: "devB" }, { clientRev: 5, deviceId: "devA" })).toBe(true);
    expect(lwwServerWins({ clientRev: 5, deviceId: "devA" }, { clientRev: 5, deviceId: "devB" })).toBe(false);
  });

  it("a pending local mutation is NOT overwritten by the server (local intent wins)", () => {
    const local = [client({ id: "x", name: "MY_EDIT", clientRev: 1 })];
    const merged = mergePulledClients(local, [client({ id: "x", name: "SERVER", clientRev: 9 })], new Set(["x"]));
    expect(merged[0].name).toBe("MY_EDIT");
  });

  it("first-contact: a local-only row adopts the server id (no duplicate)", () => {
    const local = [client({ id: "localB", name: "Alice", clientLocalKey: "101::ALICE", serverUpdatedAt: undefined })];
    const incoming = [client({ id: "serverA", name: "Alice", clientLocalKey: "101::ALICE", clientRev: 1 })];
    const merged = mergePulledClients(local, incoming, none);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("serverA"); // adopted
  });

  it("never drops a local-only guest that isn't on the server", () => {
    const local = [client({ id: "onlyLocal", name: "Bob", serverUpdatedAt: undefined, clientLocalKey: "102::BOB" })];
    const merged = mergePulledClients(local, [], none);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("onlyLocal");
  });

  it("brand-new server row is added", () => {
    const merged = mergePulledClients([], [client({ id: "new", name: "Carol", clientRev: 1 })], none);
    expect(merged.map((c) => c.id)).toContain("new");
  });

  it("checkins: new server checkin appended; lower rev ignored; tombstone applied", () => {
    const ci = (over: Partial<CheckInRecord>): CheckInRecord => ({
      id: "ck1", roomNumber: "101", clientName: "Alice", peopleEntered: 1,
      timestamp: "2026-06-21T07:00:00Z", clientRev: 0, deviceId: "devA", ...over,
    });
    const appended = mergePulledCheckins([], [ci({ id: "srv" })], none);
    expect(appended).toHaveLength(1);

    const local = [ci({ id: "ck1", peopleEntered: 2, clientRev: 5 })];
    const ignored = mergePulledCheckins(local, [ci({ id: "ck1", peopleEntered: 9, clientRev: 1 })], none);
    expect(ignored[0].peopleEntered).toBe(2);

    const tombstoned = mergePulledCheckins(local, [ci({ id: "ck1", clientRev: 6, deletedAt: "2026-06-21T09:00:00Z" })], none);
    expect(tombstoned[0].deletedAt).toBeTruthy();
  });
});
