import { describe, it, expect } from "vitest";
import { searchClients } from "@/lib/utils";
import type { Client } from "@/lib/types";
const mk = (r: string, n: string): Client => ({
  roomNumber: r, roomType: "", rtc: "", confirmationNumber: "", name: n,
  arrivalDate: "", departureDate: "", reservationStatus: "", adults: 1, children: 0,
  rateCode: "", packageCode: "",
});
const CL = [mk("822", "LEFÈVRE/CLAIRE"), mk("224", "POLANCO/ANGEL"), mk("601", "SÉDALO/TETE")];

describe("searching by name ignores accents", () => {
  it("finds Lefèvre when typing lefevre", () => {
    expect(searchClients(CL, "lefevre", "alpha").map(c => c.roomNumber)).toEqual(["822"]);
  });
  it("finds Sédalo when typing sedalo", () => {
    expect(searchClients(CL, "sedalo", "alpha").map(c => c.roomNumber)).toEqual(["601"]);
  });
  it("still finds an accented query against an accented name", () => {
    expect(searchClients(CL, "LEFÈVRE", "alpha")).toHaveLength(1);
  });
  it("auto-detects letters even in numeric mode, so one field serves both", () => {
    expect(searchClients(CL, "polanco", "numeric").map(c => c.roomNumber)).toEqual(["224"]);
  });
  it("still matches room prefixes", () => {
    expect(searchClients(CL, "22", "numeric").map(c => c.roomNumber)).toEqual(["224"]);
  });
  it("returns nothing for an empty query", () => {
    expect(searchClients(CL, "  ", "numeric")).toEqual([]);
  });
});
