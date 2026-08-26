import { describe, it, expect } from "vitest";
import { stayFormule } from "@/lib/stay-formule";
import { Client, CheckInRecord } from "@/lib/types";

/**
 * "How did this guest pay last time?"
 *
 * Every past stay row said "1 pers · ch. 718" and nothing about how the
 * breakfast was covered — while the answer was already stored on the check-in
 * we saved that morning. The room charge, the card, the cash, the swap: all
 * recorded, none of it ever read back.
 *
 * It matters at the door. A guest whose breakfast was put on the room three
 * mornings running is not a guest to ask a fourth time; a guest who paid cash
 * every time is not one to charge the room by reflex.
 *
 * Same `formuleOf` the report uses, so the guest page and the briefing cannot
 * disagree about the same morning.
 */
const client = (packageCode: string, extra: Partial<Client> = {}): Client => ({
  roomNumber: "718", 
  name: "LAURENT/LUCIE", arrivalDate: "06/08/26", departureDate: "07/08/26",
  adults: 1, children: 0, rateCode: "", packageCode, ...extra,
});

const ci = (paymentAction?: string, peopleEntered = 1): CheckInRecord => ({
  id: "ci1", roomNumber: "718", clientName: "LAURENT/LUCIE",
  peopleEntered, timestamp: "2026-08-06T07:30:00.000Z",
  ...(paymentAction ? { paymentAction } : {}),
});

describe("stayFormule", () => {
  it("reads the reservation when the reservation decided it", () => {
    expect(stayFormule(client("BKF INC"), [ci()])).toBe("inclus");
    expect(stayFormule(client("BKF COMP"), [ci()])).toBe("comp");
  });

  it("reads what reception chose at the door", () => {
    expect(stayFormule(client(""), [ci("room")])).toBe("chambre");
    expect(stayFormule(client(""), [ci("card")])).toBe("carte");
    expect(stayFormule(client(""), [ci("cash")])).toBe("cash");
    expect(stayFormule(client(""), [ci("supervisor")])).toBe("supervisor");
  });

  it("keeps the VIP swap as its own answer", () => {
    // Not "inclus": the reservation never included breakfast, the hotel gave
    // it. US-16 exists so the briefing can see how often that happens.
    expect(stayFormule(client("", { isVip: true }), [ci("points_to_bkf")])).toBe("echange");
  });

  it("says nothing rather than guessing when they never came down", () => {
    expect(stayFormule(client(""), [])).toBeNull();
    expect(stayFormule(client("BKF INC"), [])).toBeNull();
  });

  it("ignores another room's check-in from the same morning", () => {
    const other: CheckInRecord = { ...ci("cash"), roomNumber: "999", clientName: "AUTRE/PERSONNE" };
    expect(stayFormule(client(""), [other])).toBeNull();
  });

  it("matches the guest by name when they changed room overnight", () => {
    // The person carries over, not the door number — the same rule US-15 uses.
    const moved: CheckInRecord = { ...ci("room"), roomNumber: "212" };
    expect(stayFormule(client("", { roomNumber: "212" }), [moved])).toBe("chambre");
  });

  it("is à-encaisser when they came down on no package and nothing was chosen", () => {
    expect(stayFormule(client(""), [ci()])).toBe("a-encaisser");
  });
});
