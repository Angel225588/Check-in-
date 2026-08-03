import { describe, it, expect } from "vitest";
import { expectedFromYesterday } from "@/lib/expected";
import type { Client, SessionRecord, CheckInRecord } from "@/lib/types";

const mk = (roomNumber: string, name: string, adults = 2, children = 0): Client => ({
  roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: "9" + roomNumber,
  name, arrivalDate: "01/08/26", departureDate: "05/08/26", reservationStatus: "CKIN",
  adults, children, rateCode: "", packageCode: "BKF INC",
});

const ci = (roomNumber: string, clientName: string, peopleEntered = 2): CheckInRecord => ({
  id: `${roomNumber}-${clientName}`, roomNumber, clientName, peopleEntered,
  timestamp: "2026-08-01T07:30:00.000Z",
});

const session = (date: string, clients: Client[], checkIns: CheckInRecord[]): SessionRecord => ({
  date, closedAt: date, totalRooms: clients.length, totalGuests: 0, totalEntered: 0,
  totalRemaining: 0, totalVip: 0, clients, checkIns, rawUploadText: "",
});

describe("expected from yesterday", () => {
  // The whole point: this is a FACT, not a forecast. These people came down
  // yesterday and they have not checked out. Nothing here predicts anything.
  it("counts people who came yesterday and are still in the house", () => {
    const yesterday = session(
      "2026-08-01",
      [mk("101", "DUPONT/MARIE"), mk("202", "LEFEVRE/CLAIRE")],
      [ci("101", "DUPONT/MARIE"), ci("202", "LEFEVRE/CLAIRE")]
    );
    const today = [mk("101", "DUPONT/MARIE"), mk("202", "LEFEVRE/CLAIRE")];
    expect(expectedFromYesterday(today, [yesterday], "2026-08-02")).toEqual({
      people: 4, rooms: 2, basedOn: "2026-08-01",
    });
  });

  it("ignores guests who were here yesterday but never came down", () => {
    const yesterday = session(
      "2026-08-01",
      [mk("101", "DUPONT/MARIE"), mk("202", "LEFEVRE/CLAIRE")],
      [ci("101", "DUPONT/MARIE")]           // 202 was a no-show
    );
    const today = [mk("101", "DUPONT/MARIE"), mk("202", "LEFEVRE/CLAIRE")];
    expect(expectedFromYesterday(today, [yesterday], "2026-08-02").rooms).toBe(1);
  });

  it("ignores yesterday's guests who have checked out", () => {
    const yesterday = session("2026-08-01", [mk("101", "DUPONT/MARIE")], [ci("101", "DUPONT/MARIE")]);
    expect(expectedFromYesterday([], [yesterday], "2026-08-02").people).toBe(0);
  });

  // Guests get moved between rooms. The person is what carries over, not the
  // door number — matching on the room would drop them the morning they change.
  it("follows the guest when their room changes overnight", () => {
    const yesterday = session("2026-08-01", [mk("101", "DUPONT/MARIE")], [ci("101", "DUPONT/MARIE")]);
    const today = [mk("310", "Dupont, Marie")];
    expect(expectedFromYesterday(today, [yesterday], "2026-08-02").rooms).toBe(1);
  });

  it("counts today's party size, not yesterday's", () => {
    const yesterday = session("2026-08-01", [mk("101", "DUPONT/MARIE", 1, 0)], [ci("101", "DUPONT/MARIE", 1)]);
    const today = [mk("101", "DUPONT/MARIE", 2, 1)];
    expect(expectedFromYesterday(today, [yesterday], "2026-08-02").people).toBe(3);
  });

  it("uses the most recent past session, not the oldest", () => {
    const older = session("2026-07-28", [mk("101", "ANCIEN/GUEST")], [ci("101", "ANCIEN/GUEST")]);
    const yesterday = session("2026-08-01", [mk("202", "LEFEVRE/CLAIRE")], [ci("202", "LEFEVRE/CLAIRE")]);
    const today = [mk("101", "ANCIEN/GUEST"), mk("202", "LEFEVRE/CLAIRE")];
    const r = expectedFromYesterday(today, [older, yesterday], "2026-08-02");
    expect(r.basedOn).toBe("2026-08-01");
    expect(r.rooms).toBe(1);
  });

  // With nothing to compare against there is no figure — and saying so is the
  // whole difference between a fact and a guess.
  it("reports nothing rather than zero when there is no previous day", () => {
    expect(expectedFromYesterday([mk("101", "X/Y")], [], "2026-08-02")).toEqual({
      people: 0, rooms: 0, basedOn: null,
    });
  });

  it("does not treat today's own session as the previous day", () => {
    const todaySession = session("2026-08-02", [mk("101", "X/Y")], [ci("101", "X/Y")]);
    expect(expectedFromYesterday([mk("101", "X/Y")], [todaySession], "2026-08-02").basedOn).toBe(null);
  });
});
