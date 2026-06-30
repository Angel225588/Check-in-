import { describe, it, expect, beforeEach } from "vitest";
import {
  saveTodayData,
  getTodayData,
  applyServerCheckins,
  addCheckInTombstone,
} from "@/lib/storage";
import { CheckInRecord, DailyData, Client } from "@/lib/types";

function ci(
  id: string,
  room = "101",
  name = "DUPONT",
  pax = 2,
  ts = "2026-06-30T11:00:00.000Z",
): CheckInRecord {
  return { id, roomNumber: room, clientName: name, peopleEntered: pax, timestamp: ts };
}

function client(room = "101", name = "DUPONT", adults = 2): Client {
  return {
    roomNumber: room,
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name,
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults,
    children: 0,
    rateCode: "",
    packageCode: "",
  };
}

function seed(checkIns: CheckInRecord[]) {
  const data: DailyData = { date: "", clients: [client()], checkIns };
  saveTodayData(data);
}

describe("applyServerCheckins — cross-device check-in reconcile (Sync v2)", () => {
  beforeEach(() => localStorage.clear());

  it("adds a server check-in not present locally (device B sees device A's check-in)", () => {
    seed([]);
    applyServerCheckins([ci("a-1")], []);
    const got = getTodayData()!.checkIns;
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("a-1");
    expect(got[0].peopleEntered).toBe(2);
  });

  it("is idempotent — re-applying the same record never duplicates", () => {
    seed([ci("a-1")]);
    applyServerCheckins([ci("a-1")], []);
    applyServerCheckins([ci("a-1")], []);
    expect(getTodayData()!.checkIns).toHaveLength(1);
  });

  it("merges distinct records from two devices without collapsing legitimate partials", () => {
    seed([ci("a-1", "101", "DUPONT", 1)]);
    applyServerCheckins([ci("a-1", "101", "DUPONT", 1), ci("b-2", "101", "DUPONT", 1)], []);
    const got = getTodayData()!.checkIns;
    expect(got).toHaveLength(2);
    expect(got.reduce((s, c) => s + c.peopleEntered, 0)).toBe(2);
  });

  it("removes a record the server marked deleted (undo propagates across devices)", () => {
    seed([ci("a-1")]);
    applyServerCheckins([], ["a-1"]);
    expect(getTodayData()!.checkIns).toHaveLength(0);
  });

  it("does not resurrect a locally-undone record even if the server still shows it live", () => {
    seed([ci("a-1")]);
    addCheckInTombstone("a-1"); // this device undid it; the tombstone push has not landed yet
    saveTodayData({ ...getTodayData()!, checkIns: [] }); // local undo removed it
    applyServerCheckins([ci("a-1")], []); // server still lists it as live
    expect(getTodayData()!.checkIns).toHaveLength(0);
  });

  it("no-ops safely when there is no open day", () => {
    expect(() => applyServerCheckins([ci("a-1")], [])).not.toThrow();
    expect(getTodayData()).toBeNull();
  });
});
