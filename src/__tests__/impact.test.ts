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
  c({ roomNumber: "102", name: "MARTIN", adults: 1, children: 1, packageCode: "BKF COMP" }), // comp, pax 2
  c({ roomNumber: "103", name: "WALK", adults: 1, packageCode: "", vipSource: "walk_in" }), // hors, pax 1
  c({ roomNumber: "104", name: "VIP", adults: 1, packageCode: "BKF INC", isVip: true }), // inclus + vip overlay
  c({ roomNumber: "", name: "", adults: 0, children: 0 }), // incomplete → à vérifier
];

describe("computeImpact — start-of-day breakdown from parsed roster", () => {
  it("total = sum of covers (pax)", () => {
    expect(computeImpact(SAMPLE).total).toBe(6);
  });

  it("partitions into comp + inclus + hors that re-sum to the total (coherent by construction)", () => {
    const i = computeImpact(SAMPLE);
    expect(i.comp).toBe(2);
    expect(i.inclus).toBe(3);
    expect(i.hors).toBe(1);
    expect(i.comp + i.inclus + i.hors).toBe(i.total);
  });

  it("counts VIP covers as an overlay (not part of the partition sum)", () => {
    expect(computeImpact(SAMPLE).vip).toBe(1);
  });

  it("flags incomplete rows (missing name/room or zero pax) as à-vérifier", () => {
    expect(computeImpact(SAMPLE).aVerifier).toBe(1);
  });

  it("reports the room count", () => {
    expect(computeImpact(SAMPLE).rooms).toBe(5);
  });

  it("is all-zero for an empty roster", () => {
    const i = computeImpact([]);
    expect(i).toMatchObject({ total: 0, inclus: 0, comp: 0, vip: 0, hors: 0, aVerifier: 0, rooms: 0 });
  });
});
