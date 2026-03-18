import { describe, it, expect } from "vitest";
import {
  getEnteredForClient,
  getRemainingForRoom,
  getCompStats,
  getRoomStatusCounts,
} from "@/lib/utils";
import { generateDayReport } from "@/lib/report";
import { Client, CheckInRecord } from "@/lib/types";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    roomNumber: "302",
    roomType: "DLXK",
    rtc: "",
    confirmationNumber: "100",
    name: "SMITH, John",
    arrivalDate: "01/03/26",
    departureDate: "05/03/26",
    reservationStatus: "CKIN",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...overrides,
  };
}

// Shared room scenario: room 302 has SMITH (2 adults) and JONES (1 adult, 1 child)
const clientSmith = makeClient({ name: "SMITH, John", adults: 2, children: 0, confirmationNumber: "100" });
const clientJones = makeClient({ name: "JONES, Mary", adults: 1, children: 1, confirmationNumber: "200" });

// Check-ins: SMITH checked in 2, JONES checked in 1
const sharedRoomCheckIns: CheckInRecord[] = [
  { id: "a", roomNumber: "302", clientName: "SMITH, John", peopleEntered: 2, timestamp: "2026-03-18T08:00:00Z" },
  { id: "b", roomNumber: "302", clientName: "JONES, Mary", peopleEntered: 1, timestamp: "2026-03-18T08:30:00Z" },
];

describe("getEnteredForClient", () => {
  it("returns only check-ins matching room AND name", () => {
    expect(getEnteredForClient(clientSmith, sharedRoomCheckIns)).toBe(2);
    expect(getEnteredForClient(clientJones, sharedRoomCheckIns)).toBe(1);
  });

  it("name matching is case-insensitive", () => {
    const checkIns: CheckInRecord[] = [
      { id: "x", roomNumber: "302", clientName: "smith, john", peopleEntered: 2, timestamp: "2026-03-18T08:00:00Z" },
    ];
    expect(getEnteredForClient(clientSmith, checkIns)).toBe(2);
  });

  it("returns 0 when no matching check-ins", () => {
    const other = makeClient({ roomNumber: "999", name: "NOBODY" });
    expect(getEnteredForClient(other, sharedRoomCheckIns)).toBe(0);
  });
});

describe("getRemainingForRoom — shared room fix", () => {
  it("SMITH (2 adults, 2 entered) → 0 remaining", () => {
    expect(getRemainingForRoom(clientSmith, sharedRoomCheckIns)).toBe(0);
  });

  it("JONES (2 guests, 1 entered) → 1 remaining", () => {
    expect(getRemainingForRoom(clientJones, sharedRoomCheckIns)).toBe(1);
  });

  it("single-room client → no regression", () => {
    const solo = makeClient({ roomNumber: "101", name: "SOLO", adults: 3, children: 0 });
    const checkIns: CheckInRecord[] = [
      { id: "s1", roomNumber: "101", clientName: "SOLO", peopleEntered: 1, timestamp: "2026-03-18T08:00:00Z" },
    ];
    expect(getRemainingForRoom(solo, checkIns)).toBe(2);
  });
});

describe("getCompStats — shared room fix", () => {
  it("only counts comp client's check-ins as comp entered", () => {
    const compClient = makeClient({ name: "COMP GUY", packageCode: "BKF COMP", adults: 2, children: 0 });
    const nonCompClient = makeClient({ name: "NON COMP", packageCode: "REGULAR", adults: 1, children: 0 });
    const checkIns: CheckInRecord[] = [
      { id: "c1", roomNumber: "302", clientName: "COMP GUY", peopleEntered: 2, timestamp: "2026-03-18T08:00:00Z" },
      { id: "c2", roomNumber: "302", clientName: "NON COMP", peopleEntered: 1, timestamp: "2026-03-18T08:30:00Z" },
    ];
    const stats = getCompStats([compClient, nonCompClient], checkIns);
    expect(stats.total).toBe(2); // only comp client's guests
    expect(stats.entered).toBe(2); // only comp client's check-ins
  });

  it("works with no comp clients", () => {
    const stats = getCompStats([clientSmith], sharedRoomCheckIns);
    expect(stats.total).toBe(0);
    expect(stats.entered).toBe(0);
  });
});

describe("getRoomStatusCounts — shared room fix", () => {
  it("shared room: one all-in, one partial", () => {
    const counts = getRoomStatusCounts([clientSmith, clientJones], sharedRoomCheckIns);
    // SMITH: 2/2 entered → allIn. JONES: 1/2 entered → partial
    expect(counts.allIn).toBe(1);
    expect(counts.partial).toBe(1);
    expect(counts.noShow).toBe(0);
    expect(counts.totalRooms).toBe(2);
  });

  it("shared room: one all-in, one no-show", () => {
    const smithOnly: CheckInRecord[] = [
      { id: "a", roomNumber: "302", clientName: "SMITH, John", peopleEntered: 2, timestamp: "2026-03-18T08:00:00Z" },
    ];
    const counts = getRoomStatusCounts([clientSmith, clientJones], smithOnly);
    expect(counts.allIn).toBe(1);
    expect(counts.partial).toBe(0);
    expect(counts.noShow).toBe(1);
  });
});

describe("generateDayReport — shared room fix", () => {
  it("reports correct per-client entered/remaining for shared rooms", () => {
    const report = generateDayReport([clientSmith, clientJones], sharedRoomCheckIns);
    const smithReport = report.rooms.find((r) => r.name === "SMITH, John");
    const jonesReport = report.rooms.find((r) => r.name === "JONES, Mary");

    expect(smithReport?.entered).toBe(2);
    expect(smithReport?.remaining).toBe(0);
    expect(smithReport?.status).toBe("all-in");

    expect(jonesReport?.entered).toBe(1);
    expect(jonesReport?.remaining).toBe(1);
    expect(jonesReport?.status).toBe("partial");
  });
});
