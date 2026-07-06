import { describe, it, expect } from "vitest";
import { computeImpact } from "@/lib/impact";
import { Client } from "@/lib/types";

function c(partial: Partial<Client>): Client {
  return {
    roomNumber: "100",
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name: "GUEST",
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 1,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...partial,
  };
}

const SAMPLE: Client[] = [
  c({ roomNumber: "101", name: "DUPONT", adults: 2, packageCode: "BKF INC" }), // inclus, pax 2
  c({ roomNumber: "102", name: "MARTIN", adults: 2, packageCode: "BKF COMP" }), // comp, pax 2
  c({ roomNumber: "103", name: "WALK", adults: 1, packageCode: "", vipSource: "walk_in" }), // hors, pax 1
  c({ roomNumber: "104", name: "VIP", adults: 1, packageCode: "BKF INC", isVip: true }), // inclus + vip overlay
  c({ roomNumber: "105", name: "TOUR", adults: 3, packageCode: "BKF GRP" }), // groupe, pax 3
  c({ roomNumber: "", name: "", adults: 0, children: 0 }), // empty row — counts as a room, 0 pax
];

describe("computeImpact — package distribution from the parsed roster", () => {
  it("total = sum of covers (pax)", () => {
    expect(computeImpact(SAMPLE).total).toBe(9);
  });

  it("partitions into comp + groupe + inclus + hors that re-sum to the total", () => {
    const i = computeImpact(SAMPLE);
    expect(i.comp).toBe(2);
    expect(i.groupe).toBe(3);
    expect(i.inclus).toBe(3);
    expect(i.hors).toBe(1);
    expect(i.comp + i.groupe + i.inclus + i.hors).toBe(i.total);
  });

  it("counts VIP covers as an overlay (not part of the partition sum)", () => {
    expect(computeImpact(SAMPLE).vip).toBe(1);
  });

  it("reports the room count", () => {
    expect(computeImpact(SAMPLE).rooms).toBe(6);
  });

  it("reports adults + children so they can be picked as metrics", () => {
    const i = computeImpact(SAMPLE);
    expect(i.adults).toBe(9);
    expect(i.children).toBe(0);
  });

  it("has no à-vérifier field (dropped — confusing, no link)", () => {
    expect("aVerifier" in computeImpact(SAMPLE)).toBe(false);
  });

  it("is all-zero for an empty roster", () => {
    const i = computeImpact([]);
    expect(i).toMatchObject({ total: 0, inclus: 0, comp: 0, groupe: 0, vip: 0, hors: 0, rooms: 0 });
  });
});
