import { describe, it, expect } from "vitest";
import { generateDayReport, exportReportCSV } from "@/lib/report";
import { Client, CheckInRecord } from "@/lib/types";

const clients: Client[] = [
  {
    roomNumber: "101", roomType: "DLXK", rtc: "", confirmationNumber: "111",
    name: "GUEST ALL IN", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "", packageCode: "",
  },
  {
    roomNumber: "202", roomType: "PRMK", rtc: "", confirmationNumber: "222",
    name: "GUEST PARTIAL", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 3, children: 1, rateCode: "", packageCode: "",
  },
  {
    roomNumber: "303", roomType: "STHT", rtc: "", confirmationNumber: "333",
    name: "GUEST NO SHOW", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "", packageCode: "",
  },
  {
    roomNumber: "404", roomType: "DLXK", rtc: "", confirmationNumber: "444",
    name: "VIP GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 1, children: 0, rateCode: "", packageCode: "",
    isVip: true, vipLevel: "X4", vipNotes: "High Floor",
  },
  {
    roomNumber: "505", roomType: "DLXK", rtc: "", confirmationNumber: "555",
    name: "COMP GUEST", arrivalDate: "01/03/26", departureDate: "05/03/26",
    reservationStatus: "CKIN", adults: 2, children: 0, rateCode: "", packageCode: "BKF COMP",
  },
];

const checkIns: CheckInRecord[] = [
  { id: "1", roomNumber: "101", clientName: "GUEST ALL IN", peopleEntered: 2, timestamp: "2026-03-07T08:00:00Z" },
  { id: "2", roomNumber: "202", clientName: "GUEST PARTIAL", peopleEntered: 2, timestamp: "2026-03-07T08:30:00Z" },
  { id: "3", roomNumber: "404", clientName: "VIP GUEST", peopleEntered: 1, timestamp: "2026-03-07T09:00:00Z" },
  { id: "4", roomNumber: "505", clientName: "COMP GUEST", peopleEntered: 2, timestamp: "2026-03-07T09:15:00Z" },
];

describe("Report - generateDayReport", () => {
  const report = generateDayReport(clients, checkIns);

  it("counts total rooms", () => {
    expect(report.totalRooms).toBe(5);
  });

  it("counts total guests", () => {
    // 2 + 4 + 2 + 1 + 2 = 11
    expect(report.totalGuests).toBe(11);
  });

  it("counts total entered", () => {
    // 2 + 2 + 1 + 2 = 7
    expect(report.totalEntered).toBe(7);
  });

  it("counts total remaining", () => {
    expect(report.totalRemaining).toBe(4);
  });

  it("counts VIP rooms", () => {
    expect(report.totalVip).toBe(1);
  });

  it("counts COMP rooms", () => {
    expect(report.totalComp).toBe(1);
  });

  it("counts COMP persons expected (adults across COMP rooms)", () => {
    // Room 505 (COMP) has 2 adults → totalCompPersons = 2
    expect(report.totalCompPersons).toBe(2);
  });

  it("counts COMP persons entered (live progress matching main screen MetricsBar)", () => {
    // Room 505 has check-in for 2 people → totalCompPersonsEntered = 2
    expect(report.totalCompPersonsEntered).toBe(2);
  });

  it("invariant: totalCompPersonsEntered <= totalCompPersons", () => {
    expect(report.totalCompPersonsEntered).toBeLessThanOrEqual(report.totalCompPersons);
  });

  it("totalCompPersonsEntered handles no check-ins (returns 0)", () => {
    const r = generateDayReport(clients, []);
    expect(r.totalCompPersonsEntered).toBe(0);
    // …but totalCompPersons stays at 2 (expected, not progress)
    expect(r.totalCompPersons).toBe(2);
  });

  it("totalCompPersonsEntered handles no COMP rooms (returns 0)", () => {
    const noCompClients = clients.filter((c) => !c.packageCode.includes("COMP"));
    const r = generateDayReport(noCompClients, checkIns);
    expect(r.totalCompPersonsEntered).toBe(0);
    expect(r.totalCompPersons).toBe(0);
  });

  it("marks all-in rooms correctly", () => {
    const room101 = report.rooms.find((r) => r.roomNumber === "101");
    expect(room101?.status).toBe("all-in");
    expect(room101?.entered).toBe(2);
    expect(room101?.remaining).toBe(0);
  });

  it("marks partial rooms correctly", () => {
    const room202 = report.rooms.find((r) => r.roomNumber === "202");
    expect(room202?.status).toBe("partial");
    expect(room202?.entered).toBe(2);
    expect(room202?.remaining).toBe(2);
  });

  it("marks no-show rooms correctly", () => {
    const room303 = report.rooms.find((r) => r.roomNumber === "303");
    expect(room303?.status).toBe("no-show");
    expect(room303?.entered).toBe(0);
    expect(room303?.remaining).toBe(2);
  });

  it("includes VIP data in room report", () => {
    const room404 = report.rooms.find((r) => r.roomNumber === "404");
    expect(room404?.isVip).toBe(true);
    expect(room404?.vipLevel).toBe("X4");
  });

  it("includes comp data in room report", () => {
    const room505 = report.rooms.find((r) => r.roomNumber === "505");
    expect(room505?.isComp).toBe(true);
  });

  it("sorts check-ins chronologically", () => {
    const timestamps = report.checkIns.map((c) => c.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(new Date(timestamps[i]).getTime()).toBeGreaterThanOrEqual(
        new Date(timestamps[i - 1]).getTime()
      );
    }
  });

  it("handles empty data", () => {
    const empty = generateDayReport([], []);
    expect(empty.totalRooms).toBe(0);
    expect(empty.totalGuests).toBe(0);
    expect(empty.totalEntered).toBe(0);
    expect(empty.rooms).toHaveLength(0);
  });

  it("handles all rooms being no-shows", () => {
    const r = generateDayReport(clients, []);
    expect(r.rooms.every((room) => room.status === "no-show")).toBe(true);
    expect(r.totalEntered).toBe(0);
    expect(r.totalRemaining).toBe(11);
  });
});

/**
 * Total reconciliation: app TOTAL vs Opera/PMS daily doc.
 *
 * Bug Angel flagged 2026-06-22: the check-in screen TOTAL didn't match the
 * Opera doc. Reproduces her example — doc says 250 total with 50 COMP — and
 * proves the grand total blends the printed breakfast list with off-list
 * (hors-liste) additions, while children are counted exactly once and
 * correctly excluded from COMP.
 */
describe("Report - total reconciliation (doc vs app)", () => {
  function mk(
    room: string,
    name: string,
    adults: number,
    children: number,
    pkg: string,
    src: Client["vipSource"]
  ): Client {
    return {
      roomNumber: room, roomType: "", rtc: "", confirmationNumber: "", name,
      arrivalDate: "", departureDate: "", reservationStatus: "CKIN",
      adults, children, rateCode: "", packageCode: pkg, vipSource: src,
    };
  }

  // Mirror Angel's scenario: printed breakfast list sums to 250 guests,
  // of which 50 are COMP adults. Children live on the list too (20 kids).
  // Off-list additions: 1 list-only VIP (2 adults) + 5 walk-ins (1 adult) = 7.
  const docList: Client[] = [];
  for (let i = 0; i < 25; i++) docList.push(mk(`C${i}`, `Comp ${i}`, 2, 0, "BKF COMP", "breakfast_list")); // 50 comp adults
  for (let i = 0; i < 80; i++) docList.push(mk(`L${i}`, `List ${i}`, 2, 0, "BKF INC", "breakfast_list"));  // 160 adults
  for (let i = 0; i < 20; i++) docList.push(mk(`K${i}`, `Kid ${i}`, 1, 1, "BKF INC", "breakfast_list"));   // 20 adults + 20 children
  // List total = 50 + 160 + 40 = 250 (the Opera doc figure), children = 20.

  const offList: Client[] = [
    mk("V1", "VIP off-list", 2, 0, "", "list_only"),
    ...Array.from({ length: 5 }, (_, i) => mk(`W${i}`, `Walk ${i}`, 1, 0, "", "walk_in")),
  ]; // 7 off-list guests, all adults

  const allClients = [...docList, ...offList];
  const report = generateDayReport(allClients, []);

  it("COMP persons stay correct (adults on COMP rooms, children excluded)", () => {
    expect(report.totalCompPersons).toBe(50);
  });

  it("exposes the breakfast-list total that reconciles with the Opera doc (excludes off-list)", () => {
    // This is the number reception should compare against the doc's 250.
    expect(report.totalListGuests).toBe(250);
  });

  it("tracks off-list (hors-liste) additions separately", () => {
    // 1 list-only VIP (2) + 5 walk-ins (1 each) = 7
    expect(report.totalOffListGuests).toBe(7);
  });

  it("grand total = list + off-list (the gap is exactly the hors-liste)", () => {
    expect(report.totalGuests).toBe(257);
    expect(report.totalListGuests + report.totalOffListGuests).toBe(report.totalGuests);
    expect(report.totalGuests - report.totalListGuests).toBe(report.totalOffListGuests);
  });

  it("counts children exactly once: adults + children == grand total", () => {
    expect(report.totalAdults).toBe(237); // 230 list adults + 7 off-list adults
    expect(report.totalChildren).toBe(20);
    expect(report.totalAdults + report.totalChildren).toBe(report.totalGuests);
  });

  it("children are in the list total but never in the COMP count", () => {
    // 250 list guests includes 20 children; COMP stays adults-only at 50.
    expect(report.totalListGuests).toBeGreaterThan(report.totalCompPersons);
    expect(report.totalChildren).toBeGreaterThan(0);
    expect(report.totalCompPersons).toBe(50); // unchanged by children
  });

  it("source breakdown exposes expected guests per source (not just entered)", () => {
    expect(report.sourceBreakdown.listGuests).toBe(250);
    expect(report.sourceBreakdown.vipListOnlyGuests).toBe(2);
    expect(report.sourceBreakdown.walkInGuests).toBe(5);
  });

  it("invariant holds with no off-list clients (pure doc list)", () => {
    const r = generateDayReport(docList, []);
    expect(r.totalListGuests).toBe(250);
    expect(r.totalOffListGuests).toBe(0);
    expect(r.totalGuests).toBe(250);
    expect(r.totalAdults + r.totalChildren).toBe(r.totalGuests);
  });

  it("legacy data with no vipSource counts as breakfast_list (whole total reconciles)", () => {
    const legacy: Client[] = [
      mk("100", "Legacy A", 2, 1, "BKF INC", undefined),
      mk("101", "Legacy B", 1, 0, "BKF COMP", undefined),
    ];
    const r = generateDayReport(legacy, []);
    expect(r.totalGuests).toBe(4);
    expect(r.totalListGuests).toBe(4); // undefined source defaults to the list
    expect(r.totalOffListGuests).toBe(0);
  });
});

describe("Report - exportReportCSV", () => {
  const report = generateDayReport(clients, checkIns);
  const csv = exportReportCSV(report);
  const lines = csv.split("\n");

  it("starts with a header row", () => {
    expect(lines[0]).toBe(
      "Room,Name,Total Guests,Entered,Remaining,Extras,Status,VIP,Breakfast,Package"
    );
  });

  it("has one data row per room plus the header", () => {
    // header + 5 rooms = 6 non-empty lines
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    expect(nonEmpty).toHaveLength(6);
  });

  it("includes correct room data in CSV", () => {
    // Room 101 = all-in
    const row101 = lines.find((l) => l.startsWith("101,"));
    expect(row101).toBeDefined();
    expect(row101).toContain("GUEST ALL IN");
    expect(row101).toContain("All In");
  });

  it("includes VIP flag in CSV", () => {
    const row404 = lines.find((l) => l.startsWith("404,"));
    expect(row404).toContain("X4");
  });

  it("includes Comp flag in CSV", () => {
    const row505 = lines.find((l) => l.startsWith("505,"));
    expect(row505).toContain("COMP");
  });

  it("marks non-VIP rooms correctly", () => {
    const row303 = lines.find((l) => l.startsWith("303,"));
    expect(row303).toContain(",No,"); // not VIP, not comp
  });

  it("escapes commas in names", () => {
    const clientsWithComma: Client[] = [{
      roomNumber: "999", roomType: "", rtc: "", confirmationNumber: "",
      name: "SMITH, JOHN", arrivalDate: "", departureDate: "",
      reservationStatus: "", adults: 1, children: 0, rateCode: "", packageCode: "",
    }];
    const r = generateDayReport(clientsWithComma, []);
    const csvResult = exportReportCSV(r);
    expect(csvResult).toContain('"SMITH, JOHN"');
  });

  it("handles empty report", () => {
    const empty = generateDayReport([], []);
    const csvResult = exportReportCSV(empty);
    const csvLines = csvResult.split("\n").filter((l) => l.trim());
    expect(csvLines).toHaveLength(1); // header only
  });
});
