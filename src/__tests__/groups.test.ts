import { describe, it, expect } from "vitest";
import { getChildrenCount, groupBlocks, getGroupStats } from "@/lib/groups";
import type { Client } from "@/lib/types";

const mk = (
  roomNumber: string,
  adults: number,
  children: number,
  packageCode = "",
  rateCode = "",
  arrivalDate = "01/08/26",
  departureDate = "04/08/26"
): Client => ({
  roomNumber, roomType: "DLXK", rtc: "", confirmationNumber: "9" + roomNumber,
  name: "GUEST " + roomNumber, arrivalDate, departureDate, reservationStatus: "CKIN",
  adults, children, rateCode, packageCode,
});

describe("children", () => {
  it("counts children across every room", () => {
    expect(getChildrenCount([mk("101", 2, 1), mk("102", 2, 0), mk("103", 1, 3)])).toBe(4);
  });

  it("is zero, not NaN, on an empty or malformed list", () => {
    expect(getChildrenCount([])).toBe(0);
    expect(getChildrenCount([{ ...mk("101", 2, 0), children: undefined as unknown as number }])).toBe(0);
  });
});

describe("group blocks", () => {
  // A group is not one room — it is a block of rooms that arrive together,
  // leave together, and come down to breakfast together.
  const tour = [
    mk("201", 2, 0, "BKF GRP", "CMXC", "01/08/26", "04/08/26"),
    mk("202", 2, 0, "BKF GRP", "CMXC", "01/08/26", "04/08/26"),
    mk("203", 1, 0, "BKF GRP", "CMXC", "01/08/26", "04/08/26"),
  ];

  it("clusters rooms sharing rate code and stay window into one block", () => {
    const blocks = groupBlocks(tour);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].rooms).toBe(3);
    expect(blocks[0].people).toBe(5);
  });

  it("keeps two tours apart when their stay windows differ", () => {
    const blocks = groupBlocks([
      ...tour,
      mk("301", 2, 0, "BKF GRP", "CMXC", "02/08/26", "05/08/26"),
      mk("302", 2, 0, "BKF GRP", "CMXC", "02/08/26", "05/08/26"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.people).sort()).toEqual([4, 5]);
  });

  it("keeps two tours apart when their rate codes differ", () => {
    const blocks = groupBlocks([
      ...tour,
      mk("401", 2, 0, "BKF GRP", "TOUR2", "01/08/26", "04/08/26"),
      mk("402", 2, 0, "BKF GRP", "TOUR2", "01/08/26", "04/08/26"),
    ]);
    expect(blocks).toHaveLength(2);
  });

  it("ignores rooms that are not on a group package", () => {
    expect(groupBlocks([mk("101", 2, 0, "BKF INC", "CMXC"), mk("102", 2, 0, "", "CMXC")])).toEqual([]);
  });

  // A lone BKF GRP room is a data quirk, not a coach. Calling it a group of one
  // would put "4 groups" on a screen when there is one tour and three strays.
  it("does not call a single room a group", () => {
    expect(groupBlocks([mk("201", 2, 0, "BKF GRP", "CMXC")])).toEqual([]);
  });

  it("sorts the biggest block first — the one that decides the morning", () => {
    const blocks = groupBlocks([
      mk("201", 1, 0, "BKF GRP", "SMALL"),
      mk("202", 1, 0, "BKF GRP", "SMALL"),
      mk("301", 2, 2, "BKF GRP", "BIG"),
      mk("302", 2, 2, "BKF GRP", "BIG"),
      mk("303", 2, 2, "BKF GRP", "BIG"),
    ]);
    expect(blocks[0].people).toBe(12);
    expect(blocks[0].rooms).toBe(3);
  });

  it("carries the stay window, so a departure cliff can be read off it", () => {
    const [b] = groupBlocks(tour);
    expect(b.arrivalDate).toBe("01/08/26");
    expect(b.departureDate).toBe("04/08/26");
  });
});

describe("group totals for the metrics bar", () => {
  it("reports blocks, rooms and people together", () => {
    const stats = getGroupStats([
      mk("201", 2, 0, "BKF GRP", "A"),
      mk("202", 2, 0, "BKF GRP", "A"),
      mk("301", 2, 1, "BKF GRP", "B"),
      mk("302", 2, 1, "BKF GRP", "B"),
      mk("101", 2, 0, "BKF INC", ""),
    ]);
    expect(stats).toEqual({ blocks: 2, rooms: 4, people: 10 });
  });

  it("is all zeroes when there is no group at all", () => {
    expect(getGroupStats([mk("101", 2, 0, "BKF INC", "")])).toEqual({ blocks: 0, rooms: 0, people: 0 });
  });
});
