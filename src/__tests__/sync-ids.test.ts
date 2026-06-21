import { describe, it, expect, beforeEach } from "vitest";
import { ensureClientId, clientLocalKey } from "../lib/sync/ids";
import { runIdBackfill } from "../lib/sync/backfill";
import type { Client, DailyData } from "../lib/types";

function client(over: Partial<Client>): Client {
  return {
    roomNumber: "101", roomType: "", rtc: "", confirmationNumber: "", name: "Test",
    arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0,
    rateCode: "", packageCode: "", ...over,
  };
}

describe("sync ids (random, immutable)", () => {
  beforeEach(() => localStorage.clear());

  it("mints an id once and keeps it stable", () => {
    const c = client({});
    const id = ensureClientId(c);
    expect(id).toBeTruthy();
    expect(ensureClientId(c)).toBe(id);
  });

  it("id survives a rename / room change (immutable across content edits)", () => {
    const c = client({ name: "Old Name", roomNumber: "101" });
    const id = ensureClientId(c);
    c.name = "Corrected Name";
    c.roomNumber = "202";
    expect(ensureClientId(c)).toBe(id);
  });

  it("two guests sharing room+name get DISTINCT ids (shared-room safety)", () => {
    const a = client({ roomNumber: "101", name: "Same Name" });
    const b = client({ roomNumber: "101", name: "Same Name" });
    expect(ensureClientId(a)).not.toBe(ensureClientId(b));
  });

  it("clientLocalKey collapses order/accent variants (advisory key)", () => {
    expect(clientLocalKey(client({ name: "A B" }))).toBe(clientLocalKey(client({ name: "B  a" })));
  });

  it("backfill stamps id + localKey + rev, and is idempotent", () => {
    const d: DailyData = {
      date: "2026-06-21",
      clients: [client({ name: "X Y" }), client({ name: "Z W", roomNumber: "102" })],
      checkIns: [],
    };
    localStorage.setItem("dailyData_2026-06-21", JSON.stringify(d));

    const r1 = runIdBackfill();
    expect(r1.migrated).toBe(2);
    const after = JSON.parse(localStorage.getItem("dailyData_2026-06-21")!) as DailyData;
    expect(after.clients.every((c) => !!c.id && c.clientRev === 0 && !!c.clientLocalKey)).toBe(true);

    const r2 = runIdBackfill();
    expect(r2.migrated).toBe(0); // nothing left to mint
  });
});
