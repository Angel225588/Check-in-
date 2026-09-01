import { describe, it, expect, beforeEach } from "vitest";
import type { Client, CheckInRecord, DailyData } from "@/lib/types";
import {
  recordDays,
  readLedger,
  ledgerMonth,
  ledgerTotals,
  LEDGER_KEY,
} from "@/lib/value-ledger";

function client(over: Partial<Client> & { roomNumber: string; name: string }): Client {
  return {
    arrivalDate: "2026-08-01",
    departureDate: "2026-08-03",
    adults: 2,
    children: 0,
    rateCode: "",
    packageCode: "BKF INC",
    vipSource: "breakfast_list",
    ...over,
  };
}

let seq = 0;
function checkIn(room: string, name: string, pax: number, date: string, time: string): CheckInRecord {
  return {
    id: `ci-${++seq}`,
    roomNumber: room,
    clientName: name,
    peopleEntered: pax,
    timestamp: new Date(`${date}T${time}:00`).toISOString(),
  };
}

/** A day with `pax` entitled covers and `off` walk-in covers. */
function day(date: string, pax: number, off = 0): DailyData {
  const clients: Client[] = [client({ roomNumber: "101", name: "ON LIST", adults: pax })];
  const checkIns: CheckInRecord[] = [checkIn("101", "ON LIST", pax, date, "08:00")];
  if (off > 0) {
    clients.push(
      client({ roomNumber: "205", name: "WALK IN", vipSource: "walk_in", packageCode: "", adults: off })
    );
    checkIns.push(checkIn("205", "WALK IN", off, date, "08:10"));
  }
  return { date, clients, checkIns };
}

beforeEach(() => {
  localStorage.clear();
});

describe("recording days", () => {
  it("rolls a day up into its month", () => {
    recordDays([day("2026-08-04", 10, 3)]);
    const m = ledgerMonth("2026-08");
    expect(m).not.toBeNull();
    expect(m!.covers).toBe(13);
    expect(m!.offListCovers).toBe(3);
    expect(m!.days).toEqual(["2026-08-04"]);
  });

  it("adds days across several months without mixing them", () => {
    recordDays([day("2026-07-30", 5), day("2026-08-04", 10)]);
    expect(ledgerMonth("2026-07")!.covers).toBe(5);
    expect(ledgerMonth("2026-08")!.covers).toBe(10);
  });

  it("is idempotent — recording the same day twice does not double the total", () => {
    // This is the whole design. The ledger is rebuilt from retained data on
    // every load, and retained data overlaps what was already counted.
    recordDays([day("2026-08-04", 10, 3)]);
    recordDays([day("2026-08-04", 10, 3)]);
    recordDays([day("2026-08-04", 10, 3)]);
    expect(ledgerMonth("2026-08")!.covers).toBe(13);
    expect(ledgerMonth("2026-08")!.days).toEqual(["2026-08-04"]);
  });

  it("accumulates genuinely new days", () => {
    recordDays([day("2026-08-04", 10)]);
    recordDays([day("2026-08-05", 20)]);
    expect(ledgerMonth("2026-08")!.covers).toBe(30);
    expect(ledgerMonth("2026-08")!.days).toHaveLength(2);
  });

  it("keeps a month that has aged out of retention entirely", () => {
    // July is recorded, then never seen again because the 30-day purge removed
    // it. The figure has to survive the data it came from — that is the point.
    recordDays([day("2026-07-15", 100, 20)]);
    recordDays([day("2026-08-04", 10)]); // a later load, July long gone
    expect(ledgerMonth("2026-07")!.covers).toBe(120);
    expect(ledgerMonth("2026-07")!.offListCovers).toBe(20);
  });

  it("ignores a day with no service rather than counting an empty morning", () => {
    recordDays([{ date: "2026-08-04", clients: [], checkIns: [] }]);
    expect(ledgerMonth("2026-08")).toBeNull();
  });
});

describe("what the ledger stores", () => {
  it("holds no guest name and no room number", () => {
    // The reason this store may outlive the retention window at all. If a name
    // ever reaches it, it becomes personal data with no purge behind it.
    recordDays([day("2026-08-04", 10, 3)]);
    const raw = localStorage.getItem(LEDGER_KEY) ?? "";
    expect(raw).not.toContain("ON LIST");
    expect(raw).not.toContain("WALK IN");
    expect(raw).not.toContain("101");
    expect(raw).not.toContain("205");
  });

  it("stores counts, never euros", () => {
    // Money is derived at render time from the current assumptions, so changing
    // the breakfast price re-prices history instead of leaving old months
    // frozen at an old rate.
    recordDays([day("2026-08-04", 10, 3)]);
    const m = ledgerMonth("2026-08")!;
    expect(m).not.toHaveProperty("offListValue");
    expect(m).not.toHaveProperty("totalValue");
  });
});

describe("peaks and busiest service", () => {
  it("keeps the busiest service across separate recordings", () => {
    recordDays([day("2026-08-04", 40)]);
    recordDays([day("2026-08-05", 10)]);
    expect(ledgerMonth("2026-08")!.busiest).toEqual({ date: "2026-08-04", covers: 40 });
  });

  it("raises the busiest service when a bigger one arrives later", () => {
    recordDays([day("2026-08-04", 10)]);
    recordDays([day("2026-08-05", 90)]);
    expect(ledgerMonth("2026-08")!.busiest).toEqual({ date: "2026-08-05", covers: 90 });
  });

  it("keeps the highest quarter-hour peak seen in the month", () => {
    recordDays([day("2026-08-04", 30)]);
    const first = ledgerMonth("2026-08")!.peak;
    expect(first).not.toBeNull();
    expect(first!.covers).toBe(30);
    expect(first!.time).toBe("08:00");

    recordDays([day("2026-08-05", 5)]);
    expect(ledgerMonth("2026-08")!.peak!.covers).toBe(30);
  });
});

describe("VIPs", () => {
  it("carries VIP attendance forward", () => {
    const vipCame = client({ roomNumber: "301", name: "VIP A", isVip: true });
    const vipAbsent = client({ roomNumber: "302", name: "VIP B", isVip: true });
    recordDays([
      {
        date: "2026-08-04",
        clients: [vipCame, vipAbsent],
        checkIns: [checkIn("301", "VIP A", 2, "2026-08-04", "08:00")],
      },
    ]);
    const m = ledgerMonth("2026-08")!;
    expect(m.vipsTotal).toBe(2);
    expect(m.vipsServed).toBe(1);
  });
});

describe("totals since the beginning", () => {
  it("adds every month the ledger has ever seen", () => {
    recordDays([day("2026-06-10", 50, 5), day("2026-07-10", 60, 6), day("2026-08-10", 70, 7)]);
    const t = ledgerTotals();
    expect(t.covers).toBe(180 + 18);
    expect(t.offListCovers).toBe(18);
    expect(t.months).toBe(3);
    expect(t.firstMonth).toBe("2026-06");
    expect(t.daysActive).toBe(3);
  });

  it("reports an honest zero on a device that has never run a service", () => {
    const t = ledgerTotals();
    expect(t.covers).toBe(0);
    expect(t.months).toBe(0);
    expect(t.firstMonth).toBeNull();
  });
});

describe("robustness", () => {
  it("survives junk in storage rather than taking the report down", () => {
    localStorage.setItem(LEDGER_KEY, "{not json");
    expect(readLedger()).toEqual({});
    recordDays([day("2026-08-04", 10)]);
    expect(ledgerMonth("2026-08")!.covers).toBe(10);
  });

  it("does not lose the ledger when one stored month is malformed", () => {
    recordDays([day("2026-08-04", 10)]);
    const led = readLedger();
    // Something wrote nonsense into July.
    localStorage.setItem(
      LEDGER_KEY,
      JSON.stringify({ ...led, "2026-07": { month: "2026-07", covers: "lots" } })
    );
    expect(ledgerMonth("2026-08")!.covers).toBe(10);
    expect(ledgerTotals().covers).toBe(10);
  });

  it("stays small — a decade of months is kilobytes, not megabytes", () => {
    for (let y = 2020; y < 2030; y++) {
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, "0");
        recordDays([day(`${y}-${mm}-05`, 200, 40)]);
      }
    }
    const bytes = (localStorage.getItem(LEDGER_KEY) ?? "").length;
    expect(ledgerTotals().months).toBe(120);
    expect(bytes).toBeLessThan(64 * 1024);
  });
});

describe("expected vs came — the gap the F&B chart is built on", () => {
  // The dashboard needs expected / came / no-show over six months and more,
  // and retention deletes the guest rows long before that. These are counts,
  // so they can live in the ledger and the chart can go back as far as the
  // hotel has been using the app.

  it("records how many people the roster expected, alongside how many came", () => {
    // 10 booked on the roster, 10 came, plus 3 walk-ins nobody expected.
    recordDays([day("2026-08-04", 10, 3)]);
    const m = ledgerMonth("2026-08")!;
    expect(m.expected).toBe(13); // 10 booked + the walk-in's own party size
    expect(m.covers).toBe(13);
  });

  it("counts a no-show as expected but not served", () => {
    const absent = client({ roomNumber: "404", name: "ABSENT", adults: 4 });
    recordDays([
      {
        date: "2026-08-04",
        clients: [client({ roomNumber: "101", name: "CAME", adults: 2 }), absent],
        checkIns: [checkIn("101", "CAME", 2, "2026-08-04", "08:00")],
      },
    ]);
    const m = ledgerMonth("2026-08")!;
    expect(m.expected).toBe(6);
    expect(m.covers).toBe(2);
  });

  it("accumulates expected across days, in step with covers", () => {
    recordDays([day("2026-08-04", 10)]);
    recordDays([day("2026-08-05", 20)]);
    expect(ledgerMonth("2026-08")!.expected).toBe(30);
    expect(ledgerMonth("2026-08")!.covers).toBe(30);
  });

  it("does not double count expected when a day is re-recorded", () => {
    recordDays([day("2026-08-04", 10, 3)]);
    recordDays([day("2026-08-04", 10, 3)]);
    expect(ledgerMonth("2026-08")!.expected).toBe(13);
  });

  it("adds expected into the since-inception totals", () => {
    recordDays([day("2026-06-10", 50), day("2026-07-10", 60)]);
    expect(ledgerTotals().expected).toBe(110);
  });

  it("still holds no personal data now that it counts the roster", () => {
    recordDays([day("2026-08-04", 10, 3)]);
    const raw = localStorage.getItem(LEDGER_KEY) ?? "";
    expect(raw).not.toContain("ON LIST");
    expect(raw).not.toContain("WALK IN");
    expect(raw).not.toContain("101");
  });

  it("reads a month written before expected existed without inventing a number", () => {
    // A ledger from the previous release has no `expected`. Defaulting it to
    // zero would draw a month where nobody was expected and everybody came,
    // which reads as a spectacular month rather than a missing field.
    localStorage.setItem(
      LEDGER_KEY,
      JSON.stringify({
        "2026-07": {
          month: "2026-07", days: ["2026-07-01"], covers: 100, offListCovers: 10,
          vipsTotal: 0, vipsServed: 0, busiest: null, peak: null,
        },
      })
    );
    const m = ledgerMonth("2026-07");
    expect(m).not.toBeNull();
    expect(m!.covers).toBe(100);
    expect(m!.expected).toBeUndefined();
  });
});
