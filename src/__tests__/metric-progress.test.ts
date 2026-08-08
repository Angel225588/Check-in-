import { describe, it, expect } from "vitest";
import { subsetProgress } from "@/lib/metric-progress";
import type { Client, CheckInRecord } from "@/lib/types";

/**
 * "Comp normally has the 2/20 so we know how many are coming and how many
 * came." — it does, in landscape, and the portrait bar lost it in the port.
 *
 * A bare "15" under COMP answers half the question reception is asking. The
 * half it drops is the half that changes what they do next: fifteen comps of
 * which two have come is a morning with thirteen conversations still in it.
 */
const c = (room: string, adults: number, pkg: string): Client => ({
  roomNumber: room, roomType: "DLXK", rtc: "", confirmationNumber: "9" + room,
  name: `NOM${room}/X`, arrivalDate: "04/08/26", departureDate: "09/08/26",
  reservationStatus: "CKIN", adults, children: 0, rateCode: "", packageCode: pkg,
});

const ci = (room: string, n: number): CheckInRecord => ({
  id: "ci" + room, roomNumber: room, clientName: `NOM${room}/X`,
  peopleEntered: n, timestamp: new Date(2026, 7, 7, 8, 0).toISOString(),
});

describe("subsetProgress", () => {
  const house = [c("201", 2, "BKF COMP"), c("202", 2, "BKF COMP"), c("203", 2, "BKF INC")];
  const isComp = (x: Client) => x.packageCode.includes("COMP");

  it("counts how many of the set came, and how many are due", () => {
    expect(subsetProgress(house, [ci("201", 2)], isComp)).toEqual({ done: 2, of: 4 });
  });

  it("is 0 of the set before anyone comes down", () => {
    expect(subsetProgress(house, [], isComp)).toEqual({ done: 0, of: 4 });
  });

  it("ignores arrivals from outside the set", () => {
    expect(subsetProgress(house, [ci("203", 2)], isComp)).toEqual({ done: 0, of: 4 });
  });

  it("never reports more arrived than expected — an écart is not a fifth guest", () => {
    // Three people walked in on a room booked for two. That is a discrepancy,
    // and the report carries it; a pill reading 5/4 just looks broken.
    expect(subsetProgress(house, [ci("201", 3), ci("202", 2)], isComp))
      .toEqual({ done: 4, of: 4 });
  });

  it("is null for an empty set, so the pill can stay a plain number", () => {
    expect(subsetProgress(house, [], (x) => x.packageCode === "NOTHING")).toBeNull();
  });
});
