import { describe, it, expect } from "vitest";
import { pickGroups, toggleGroup } from "@/lib/group-pick";
import type { GroupBlock } from "@/lib/groups";
import { Client } from "@/lib/types";

/**
 * US-21 — one coach, not all of them.
 *
 * "Groupes" as a single on/off lumps every tour together, and two coaches on
 * the same morning behave nothing alike: one leaves at seven, the other eats
 * at nine. The filter has to be able to name which one.
 *
 * Nothing selected means all of them — the pill still works as a pill, and the
 * checklist is what you open when you want less than everything.
 */
const client = (roomNumber: string, rateCode: string): Client => ({
  roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: "9" + roomNumber,
  name: `NOM${roomNumber}/X`, arrivalDate: "04/08/26", departureDate: "07/08/26",
  reservationStatus: "CKIN", adults: 2, children: 0, rateCode, packageCode: "BKF GRP",
});

const block = (key: string, rooms: string[]): GroupBlock => ({
  key, rateCode: key, arrivalDate: "04/08/26", departureDate: "07/08/26",
  rooms: rooms.length, people: rooms.length * 2,
  roomNumbers: rooms,
});

describe("pickGroups", () => {
  const tomeu = block("TOMEU", ["201", "202", "203"]);
  const toalp = block("TOALP", ["301", "302"]);
  const blocks = [tomeu, toalp];
  const house = [
    client("201", "TOMEU"), client("202", "TOMEU"), client("203", "TOMEU"),
    client("301", "TOALP"), client("302", "TOALP"),
    client("999", ""),
  ];

  it("means all of them when nothing is picked", () => {
    const rooms = pickGroups(house, blocks, []).map((c) => c.roomNumber);
    expect(rooms).toEqual(["201", "202", "203", "301", "302"]);
  });

  it("narrows to the coach you picked", () => {
    const rooms = pickGroups(house, blocks, ["TOMEU"]).map((c) => c.roomNumber);
    expect(rooms).toEqual(["201", "202", "203"]);
  });

  it("takes more than one", () => {
    const rooms = pickGroups(house, blocks, ["TOMEU", "TOALP"]).map((c) => c.roomNumber);
    expect(rooms).toHaveLength(5);
  });

  it("never lets an individual in through a group filter", () => {
    const rooms = pickGroups(house, blocks, ["TOMEU"]).map((c) => c.roomNumber);
    expect(rooms).not.toContain("999");
  });

  it("falls back to all rather than empty when the pick no longer exists", () => {
    // The day changed under a stored selection — better every group than none.
    const rooms = pickGroups(house, blocks, ["GONE"]).map((c) => c.roomNumber);
    expect(rooms).toHaveLength(5);
  });
});

describe("toggleGroup", () => {
  it("adds and removes", () => {
    expect(toggleGroup([], "TOMEU")).toEqual(["TOMEU"]);
    expect(toggleGroup(["TOMEU"], "TOALP")).toEqual(["TOMEU", "TOALP"]);
    expect(toggleGroup(["TOMEU", "TOALP"], "TOMEU")).toEqual(["TOALP"]);
  });

  it("unticking the last one means all of them again, not none", () => {
    expect(toggleGroup(["TOMEU"], "TOMEU")).toEqual([]);
  });
});
