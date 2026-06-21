import { describe, it, expect, beforeEach } from "vitest";
import { stampClient, stampCheckin, onClientUpsert, onSessionUpsert } from "../lib/sync/hooks";
import { peekAll } from "../lib/sync/outbox";
import type { Client, CheckInRecord, DailyData } from "../lib/types";

function client(over: Partial<Client>): Client {
  return {
    id: undefined, roomNumber: "101", roomType: "", rtc: "", confirmationNumber: "",
    name: "Alice", arrivalDate: "", departureDate: "", reservationStatus: "",
    adults: 1, children: 0, rateCode: "", packageCode: "", ...over,
  };
}

describe("sync hooks", () => {
  beforeEach(() => localStorage.clear());

  it("stampClient mints id, bumps rev, sets localKey + deviceId", () => {
    const c = client({ name: "Alice", roomNumber: "101" });
    stampClient(c);
    expect(c.id).toBeTruthy();
    expect(c.clientRev).toBe(1);
    expect(c.clientLocalKey).toBeTruthy();
    expect(c.deviceId).toBeTruthy();
    const firstId = c.id;
    stampClient(c);
    expect(c.clientRev).toBe(2); // bumps once per edit
    expect(c.id).toBe(firstId); // id immutable
  });

  it("stampCheckin bumps rev + sets device", () => {
    const ci: CheckInRecord = { id: "ck1", roomNumber: "101", clientName: "A", peopleEntered: 1, timestamp: "t" };
    stampCheckin(ci);
    expect(ci.clientRev).toBe(1);
    expect(ci.deviceId).toBeTruthy();
  });

  it("hooks are NO-OPS when SYNC_ENABLED is false (default in tests) — nothing enqueued", () => {
    onClientUpsert(client({ id: "c1" }), "2026-06-21");
    onSessionUpsert({ date: "2026-06-21", clients: [], checkIns: [] } as DailyData);
    expect(peekAll()).toHaveLength(0);
  });
});
