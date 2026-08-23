import { describe, it, expect } from "vitest";
import { generateDayReport } from "@/lib/report";
import { Client, CheckInRecord } from "@/lib/types";

/**
 * The report's date has to be the date of the data.
 *
 * It was `new Date()` inside the generator, so every report ever produced was
 * stamped today — including the ones built from a closed session three days
 * ago. The figures changed when you stepped back a day and the heading did
 * not, which is the exact failure US-8's Never names: a figure on the report
 * disagreeing with the figure next to it. Here it was the heading disagreeing
 * with everything.
 */
const client = (roomNumber: string): Client => ({
  roomNumber, 
  name: "DUPONT/MARIA", arrivalDate: "03/08/26", departureDate: "07/08/26",
  adults: 2, children: 0, rateCode: "", packageCode: "BKF INC",
});

const checkIn = (roomNumber: string, iso: string): CheckInRecord => ({
  id: "ci-" + roomNumber, roomNumber, clientName: "DUPONT/MARIA",
  peopleEntered: 2, timestamp: iso,
});

describe("generateDayReport — the date belongs to the data", () => {
  const today = new Date().toISOString().split("T")[0];

  it("stamps the day it was told about", () => {
    const r = generateDayReport([client("201")], [checkIn("201", "2026-08-04T07:30:00.000Z")], "2026-08-04");
    expect(r.date).toBe("2026-08-04");
  });

  it("still defaults to today for the open service", () => {
    const r = generateDayReport([client("201")], []);
    expect(r.date).toBe(today);
  });

  it("does not quietly rewrite a past date as today", () => {
    const r = generateDayReport([client("201")], [], "2026-07-19");
    expect(r.date).not.toBe(today);
    expect(r.date).toBe("2026-07-19");
  });

  it("ignores an empty date rather than stamping an empty string", () => {
    const r = generateDayReport([client("201")], [], "");
    expect(r.date).toBe(today);
  });
});
