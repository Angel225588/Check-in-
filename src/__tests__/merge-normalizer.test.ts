import { describe, it, expect } from "vitest";
import { clientKey } from "../lib/merge";
import { mergeSessionRecords } from "../lib/storage";
import type { SessionRecord, Client } from "../lib/types";

function client(over: Partial<Client>): Client {
  return {
    roomNumber: "101", roomType: "", rtc: "", confirmationNumber: "", name: "Test",
    arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0,
    rateCode: "", packageCode: "", ...over,
  };
}

function session(clients: Client[]): SessionRecord {
  return {
    date: "2026-06-21", closedAt: "", totalRooms: clients.length, totalGuests: 0,
    totalEntered: 0, totalRemaining: 0, totalVip: 0, clients, checkIns: [],
  };
}

describe("unified name normalizer (one source of truth)", () => {
  it("collapses order + accent + spacing variants to one key", () => {
    expect(clientKey(client({ roomNumber: "101", name: "POLANCO Angel" })))
      .toBe(clientKey(client({ roomNumber: "101", name: "Ángel  polanco" })));
  });

  it("keeps different rooms distinct", () => {
    expect(clientKey(client({ roomNumber: "101", name: "A B" })))
      .not.toBe(clientKey(client({ roomNumber: "102", name: "A B" })));
  });

  it("mergeSessionRecords dedupes two OCR variants of one guest into ONE history client", () => {
    const a = session([client({ roomNumber: "101", name: "POLANCO Angel" })]);
    const b = session([client({ roomNumber: "101", name: "Angel Polánco" })]);
    const merged = mergeSessionRecords(a, b);
    expect(merged.clients).toHaveLength(1);
  });
});
