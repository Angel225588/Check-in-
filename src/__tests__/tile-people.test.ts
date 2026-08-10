import { describe, it, expect } from "vitest";
import { peopleIn, tilePeople } from "@/lib/tile-people";
import type { ArrivalRow } from "@/lib/report-v2";

/**
 * The metrics bar said "Entrés 60". The report said "Entrés 30".
 *
 * Both were right and neither said so. The bar counts PEOPLE through the door;
 * the report tile counts ROOMS fully in. One word, two units, on two screens
 * reception reads within a minute of each other — so the report looked like it
 * had lost half the service.
 *
 * A tile carries both numbers now. The room count stays the headline because
 * clicking a tile filters a list of rooms, and a tile that says 60 and then
 * shows 30 rows would just move the same lie one tap further in.
 */
const row = (over: Partial<ArrivalRow>): ArrivalRow =>
  ({
    roomNumber: "101",
    name: "X",
    status: "all-in",
    entered: 2,
    totalGuests: 2,
    extras: 0,
    isVip: false,
    vipLevel: "",
    isComp: false,
    children: 0,
    offList: false,
    formule: "inclus",
    minutes: 420,
    time: "07:00",
    box: false,
    ...over,
  }) as ArrivalRow;

describe("peopleIn", () => {
  it("counts people through the door, not rooms", () => {
    const rows = [
      row({ roomNumber: "101", entered: 2 }),
      row({ roomNumber: "102", entered: 3 }),
    ];
    expect(peopleIn(rows)).toBe(5);
  });

  it("counts a partial room's arrivals, not its whole reservation", () => {
    const rows = [row({ roomNumber: "101", status: "partial", entered: 1, totalGuests: 4 })];
    expect(peopleIn(rows)).toBe(1);
  });

  it("counts nobody for a no-show", () => {
    expect(peopleIn([row({ status: "no-show", entered: 0, totalGuests: 2 })])).toBe(0);
  });
});

describe("tilePeople", () => {
  // 30 rooms all-in carrying 60 people — Angel's morning exactly.
  const rows: ArrivalRow[] = [
    ...Array.from({ length: 30 }, (_, i) =>
      row({ roomNumber: String(100 + i), status: "all-in", entered: 2, totalGuests: 2 })
    ),
    row({ roomNumber: "200", status: "no-show", entered: 0, totalGuests: 3 }),
    row({ roomNumber: "201", status: "partial", entered: 1, totalGuests: 4 }),
  ];

  it("reconciles the report with the metrics bar", () => {
    const t = tilePeople(rows);
    expect(t.in.rooms).toBe(30);
    expect(t.in.people).toBe(60);
  });

  it("reports the people an absent room was expected to bring", () => {
    // Nobody came, so "people" here is what the kitchen prepared for and lost.
    const t = tilePeople(rows);
    expect(t.no.rooms).toBe(1);
    expect(t.no.people).toBe(3);
  });

  it("reports a partial room by who actually walked in", () => {
    const t = tilePeople(rows);
    expect(t.partial.rooms).toBe(1);
    expect(t.partial.people).toBe(1);
  });

  it("counts Enfants as rooms with children, and the children in them", () => {
    // The tile printed the CHILD count as its headline, so "3" meant three
    // children while every neighbouring tile meant three rooms — and clicking
    // it filtered to a number of rows that matched nothing on its face.
    const t = tilePeople([
      row({ roomNumber: "401", children: 2, entered: 4, totalGuests: 4 }),
      row({ roomNumber: "402", children: 1, entered: 3, totalGuests: 3 }),
      row({ roomNumber: "403", children: 0, entered: 2, totalGuests: 2 }),
    ]);
    expect(t.children).toEqual({ rooms: 2, people: 3 });
  });

  it("counts VIP and COMP in people too", () => {
    const t = tilePeople([
      row({ roomNumber: "301", isVip: true, entered: 2, totalGuests: 2 }),
      row({ roomNumber: "302", isComp: true, entered: 3, totalGuests: 3 }),
      row({ roomNumber: "303", isComp: true, isVip: true, entered: 1, totalGuests: 1 }),
    ]);
    expect(t.vip).toEqual({ rooms: 2, people: 3 });
    expect(t.comp).toEqual({ rooms: 2, people: 4 });
  });

  it("gives a share of people, which is the share reception is asked about", () => {
    // 61 of 65 expected. Rooms would have said 30/32 — a different number for
    // the same morning, and the one nobody orders breakfast by.
    const t = tilePeople(rows);
    expect(t.expected).toBe(67);
    expect(t.served).toBe(61);
    expect(t.percent).toBe(91);
  });

  it("counts VIP and COMP people before service starts, not after", () => {
    // 06:35, nobody down yet. The VIP tile counts 18 rooms whether or not they
    // came, so counting only ARRIVALS underneath it printed "18 ch. / 0 pers."
    // — a tile disagreeing with itself. The people figure counts the same
    // guests the room figure counts.
    const early = [
      row({ roomNumber: "301", isVip: true, status: "no-show", entered: 0, totalGuests: 2 }),
      row({ roomNumber: "302", isComp: true, status: "no-show", entered: 0, totalGuests: 3 }),
    ];
    const t = tilePeople(early);
    expect(t.vip).toEqual({ rooms: 1, people: 2 });
    expect(t.comp).toEqual({ rooms: 1, people: 3 });
  });

  /**
   * One population, one denominator, one percentage.
   *
   * The ring said 86 % and the répartition said 84.6 % on the same screen, for
   * the same morning. Both were arithmetically right and answering slightly
   * different questions — the ring divided served by the house (148/173), the
   * répartition divided by the sum of its own blocks (148 + 27). The gap was
   * exactly the two extra covers.
   *
   * Reception should never have to work out which of two percentages is the
   * real one. The panel is now a single split of the house: served here, served
   * partly there, and everyone else missing — which sums to the house exactly
   * and shares the ring's denominator, so the headline figure is the same
   * number in both places.
   */
  it("splits the house into parts that add back up to it", () => {
    const t = tilePeople(rows);
    expect(t.in.people + t.partial.people + t.missing).toBe(t.expected);
  });

  it("counts missing people against the house, not against the absent rooms", () => {
    // 30 rooms of 2 arrive with one extra guest, one room of 3 does not.
    // The absent ROOMS expected 3; but only 2 people are missing from the
    // house, because someone unexpected turned up. Dividing 3 by the house
    // and calling it "absents" is where the two percentages parted company.
    const withExtra: ArrivalRow[] = [
      row({ roomNumber: "101", status: "all-in", entered: 3, totalGuests: 2, extras: 1 }),
      row({ roomNumber: "102", status: "no-show", entered: 0, totalGuests: 3 }),
    ];
    const t = tilePeople(withExtra);
    expect(t.expected).toBe(5);
    expect(t.served).toBe(3);
    expect(t.no.people).toBe(3); // what the absent rooms were due
    expect(t.missing).toBe(2); // what the house actually lost
  });

  it("never reports negative missing when more people turn up than expected", () => {
    const t = tilePeople([row({ entered: 9, totalGuests: 2, extras: 7 })]);
    expect(t.missing).toBe(0);
  });

  it("never reads over 100%, because more people turn up than the sheet said", () => {
    const t = tilePeople([row({ entered: 5, totalGuests: 2, extras: 3 })]);
    expect(t.percent).toBe(100);
  });

  it("is 0%, not NaN, on an empty day", () => {
    expect(tilePeople([]).percent).toBe(0);
  });
});
