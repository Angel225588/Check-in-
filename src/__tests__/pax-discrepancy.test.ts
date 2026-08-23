import { describe, it, expect, beforeEach } from "vitest";
import {
  saveClients,
  updateClient,
  getTodayData,
  getDiscrepancies,
  summarizeDiscrepancies,
  closeDay,
  getSessionHistory,
} from "@/lib/storage";
import type { Client } from "@/lib/types";

function mk(roomNumber: string, name: string, adults: number, children: number): Client {
  return {
    roomNumber, 
    name, arrivalDate: "27/07/26", departureDate: "29/07/26", 
    adults, children, rateCode: "", packageCode: "BKF INC",
  };
}

beforeEach(() => {
  localStorage.clear();
  saveClients([mk("123", "DUPONT/MARIE", 1, 0), mk("224", "POLANCO/ANGEL", 2, 0)]);
});

describe("recording a reception count error", () => {
  // The daily sheet says one guest, three turn up, reception confirms three.
  // That is a data error worth counting, not just a number to overwrite.
  it("records a discrepancy when the guest count is corrected", () => {
    updateClient(0, { adults: 2, children: 1 });
    const d = getDiscrepancies();
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      roomNumber: "123",
      beforeAdults: 1, beforeChildren: 0,
      afterAdults: 2, afterChildren: 1,
      delta: 2,
    });
  });

  it("computes a negative delta when the sheet over-counted", () => {
    updateClient(1, { adults: 1, children: 0 });
    expect(getDiscrepancies()[0].delta).toBe(-1);
  });

  it("records nothing when the counts are unchanged", () => {
    updateClient(0, { adults: 1, children: 0 });
    expect(getDiscrepancies()).toHaveLength(0);
  });

  it("records nothing when an unrelated field changes", () => {
    updateClient(0, { roomNumber: "125" });
    expect(getDiscrepancies()).toHaveLength(0);
  });

  it("still applies the update itself", () => {
    updateClient(0, { adults: 2, children: 1 });
    const c = getTodayData()!.clients[0];
    expect(c.adults).toBe(2);
    expect(c.children).toBe(1);
  });

  it("carries who the correction was about", () => {
    updateClient(0, { adults: 3 });
    expect(getDiscrepancies()[0].clientName).toBe("DUPONT/MARIE");
  });

  it("timestamps each correction", () => {
    updateClient(0, { adults: 3 });
    expect(Date.parse(getDiscrepancies()[0].at)).not.toBeNaN();
  });

  it("keeps an audit trail rather than collapsing repeated edits", () => {
    updateClient(0, { adults: 2 });
    updateClient(0, { adults: 2, children: 2 });
    expect(getDiscrepancies()).toHaveLength(2);
  });

  it("gives each entry a distinct id", () => {
    updateClient(0, { adults: 2 });
    updateClient(0, { adults: 3 });
    const [a, b] = getDiscrepancies();
    expect(a.id).not.toBe(b.id);
  });
});

describe("persistence", () => {
  // asDailyData rebuilds the object field by field, so anything it does not
  // list is silently dropped on the next read. That would have made this
  // feature look like it worked until the page reloaded.
  it("survives a re-read of the day's data", () => {
    updateClient(0, { adults: 2, children: 1 });
    expect(getTodayData()!.discrepancies).toHaveLength(1);
    expect(getDiscrepancies()).toHaveLength(1);
  });

  it("accumulates across separate rooms", () => {
    updateClient(0, { adults: 2 });
    updateClient(1, { adults: 4 });
    expect(getDiscrepancies().map((d) => d.roomNumber)).toEqual(["123", "224"]);
  });

  it("treats a day written by an older build as simply having none", () => {
    const today = new Date().toISOString().split("T")[0];
    const raw = JSON.parse(localStorage.getItem(`dailyData_${today}`)!);
    delete raw.discrepancies;
    localStorage.setItem(`dailyData_${today}`, JSON.stringify(raw));
    expect(getDiscrepancies()).toEqual([]);
  });

  it("ignores a corrupted discrepancies field instead of throwing", () => {
    const today = new Date().toISOString().split("T")[0];
    const raw = JSON.parse(localStorage.getItem(`dailyData_${today}`)!);
    raw.discrepancies = "not an array";
    localStorage.setItem(`dailyData_${today}`, JSON.stringify(raw));
    expect(getDiscrepancies()).toEqual([]);
  });
});

describe("the day's summary", () => {
  it("counts rooms, people added and people removed separately", () => {
    updateClient(0, { adults: 2, children: 1 });   // 1 -> 3, +2
    updateClient(1, { adults: 1 });                // 2 -> 1, -1
    const s = summarizeDiscrepancies(getDiscrepancies());
    expect(s).toMatchObject({ rooms: 2, corrections: 2, added: 2, removed: 1, net: 1 });
  });

  it("counts a room once even when corrected twice", () => {
    updateClient(0, { adults: 2 });
    updateClient(0, { adults: 3 });
    const s = summarizeDiscrepancies(getDiscrepancies());
    expect(s.rooms).toBe(1);
    expect(s.corrections).toBe(2);
  });

  it("reports zeros for a clean day", () => {
    expect(summarizeDiscrepancies([])).toMatchObject({ rooms: 0, corrections: 0, added: 0, removed: 0, net: 0 });
  });
});

describe("the closed day keeps its corrections", () => {
  it("carries them into the session history", () => {
    updateClient(0, { adults: 2, children: 1 });
    closeDay();
    const [session] = getSessionHistory();
    expect(session.discrepancies).toHaveLength(1);
    expect(session.discrepancies![0].delta).toBe(2);
  });
});
