import { describe, it, expect } from "vitest";
import { needsPaymentChoice } from "../lib/utils";
import type { Client } from "../lib/types";

// The "Petit-déjeuner NON inclus — à encaisser" banner renders exactly when
// needsPaymentChoice(client) is true. This locks that condition so the revenue
// leak (off-list / no-package guests waved in for free) can't silently return.
function client(over: Partial<Client>): Client {
  return {
    roomNumber: "101", name: "Guest",
    arrivalDate: "", departureDate: "", adults: 1, children: 0,
    rateCode: "", packageCode: "", ...over,
  };
}

describe("breakfast-not-included banner condition (needsPaymentChoice)", () => {
  it("MUST PAY: walk-in guest", () => {
    expect(needsPaymentChoice(client({ vipSource: "walk_in" }))).toBe(true);
  });

  it("MUST PAY: off-list VIP (list_only) with no breakfast package", () => {
    expect(needsPaymentChoice(client({ vipSource: "list_only", isVip: true, packageCode: "" }))).toBe(true);
  });

  it("MUST PAY: breakfast-list guest with no recognised package code", () => {
    expect(needsPaymentChoice(client({ vipSource: "breakfast_list", packageCode: "RACK" }))).toBe(true);
  });

  it("INCLUDED: BKF INC package → no banner", () => {
    expect(needsPaymentChoice(client({ vipSource: "breakfast_list", packageCode: "BKF INC" }))).toBe(false);
  });

  it("INCLUDED: BKF COMP package → no banner", () => {
    expect(needsPaymentChoice(client({ packageCode: "BKF COMP" }))).toBe(false);
  });

  it("INCLUDED: BKF GRP / EXCL / UPSFPDJ → no banner", () => {
    expect(needsPaymentChoice(client({ packageCode: "BKF GRP" }))).toBe(false);
    expect(needsPaymentChoice(client({ packageCode: "BKF EXCL" }))).toBe(false);
    expect(needsPaymentChoice(client({ packageCode: "UPSFPDJ" }))).toBe(false);
  });
});
