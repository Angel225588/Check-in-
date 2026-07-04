import { describe, it, expect } from "vitest";
import {
  shouldRetryStatus,
  parseJsonLoose,
  overlayPackageForecast,
} from "@/lib/ocr-helpers";
import { sanitizeAndValidatePackageRow, sanitizeAndValidateClient } from "@/lib/validate";

// --------------------------------------------------------------------------
// Reliability: retry on transient upstream failures
// --------------------------------------------------------------------------
describe("shouldRetryStatus", () => {
  it("retries on rate limit and 5xx", () => {
    [429, 500, 502, 503, 504].forEach((s) => expect(shouldRetryStatus(s)).toBe(true));
  });

  it("does not retry on success or client errors", () => {
    [200, 201, 400, 401, 403, 404].forEach((s) => expect(shouldRetryStatus(s)).toBe(false));
  });
});

// --------------------------------------------------------------------------
// Reliability: tolerant JSON parsing (truncation / surrounding noise)
// --------------------------------------------------------------------------
describe("parseJsonLoose", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoose('{"type":"clients","clients":[]}')).toEqual({
      type: "clients",
      clients: [],
    });
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n" + '{"type":"vip","clients":[]}' + "\n```";
    expect(parseJsonLoose(raw)).toEqual({ type: "vip", clients: [] });
  });

  it("salvages JSON with leading prose", () => {
    const raw = 'Here is the data you asked for:\n{"pages":2,"clients":[]}';
    expect(parseJsonLoose(raw)).toEqual({ pages: 2, clients: [] });
  });

  it("salvages a JSON array wrapped in noise", () => {
    const raw = 'result = [{"roomNumber":"101"}] end';
    expect(parseJsonLoose(raw)).toEqual([{ roomNumber: "101" }]);
  });

  it("throws when there is no JSON at all", () => {
    expect(() => parseJsonLoose("totally not json")).toThrow();
  });
});

// --------------------------------------------------------------------------
// Package-forecast rows: room + package, NO name required
// --------------------------------------------------------------------------
describe("sanitizeAndValidatePackageRow", () => {
  it("accepts a room + package row with no name", () => {
    const row: Record<string, unknown> = { roomNumber: "412", packageCode: "BKF INC" };
    expect(sanitizeAndValidatePackageRow(row)).toBe(true);
    expect(row.packageCode).toBe("BKF INC");
  });

  it("rejects a row with no package code", () => {
    expect(sanitizeAndValidatePackageRow({ roomNumber: "412", packageCode: "" })).toBe(false);
    expect(sanitizeAndValidatePackageRow({ roomNumber: "412" })).toBe(false);
  });

  it("rejects a row with an invalid room number", () => {
    expect(sanitizeAndValidatePackageRow({ roomNumber: "AB", packageCode: "BKF" })).toBe(false);
    expect(sanitizeAndValidatePackageRow({ roomNumber: "", packageCode: "BKF" })).toBe(false);
  });

  it("normalizes and strips HTML from the package code", () => {
    const row: Record<string, unknown> = { roomNumber: "412", packageCode: "  bkf   inc <b>x</b> " };
    expect(sanitizeAndValidatePackageRow(row)).toBe(true);
    expect(row.packageCode).toBe("BKF INC X");
  });

  it("a nameless package row is NOT a valid client (regression guard)", () => {
    // The whole reason R118 returned 0 rooms: nameless rows fail client validation.
    expect(sanitizeAndValidateClient({ roomNumber: "412", packageCode: "BKF INC" })).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Overlay: apply package codes onto matching rooms, safely
// --------------------------------------------------------------------------
describe("overlayPackageForecast", () => {
  const clients = [
    { roomNumber: "101", name: "Smith", packageCode: "" },
    { roomNumber: "202", name: "Dupont", packageCode: "" },
    { roomNumber: "303", name: "Khan", packageCode: "EXISTING" },
  ];

  it("fills empty packageCode on matching rooms", () => {
    const out = overlayPackageForecast(clients, [
      { roomNumber: "101", packageCode: "BKF INC" },
      { roomNumber: "202", packageCode: "BKF GRP" },
    ]);
    expect(out[0].packageCode).toBe("BKF INC");
    expect(out[1].packageCode).toBe("BKF GRP");
  });

  it("never overwrites an existing packageCode", () => {
    const out = overlayPackageForecast(clients, [{ roomNumber: "303", packageCode: "NEW" }]);
    expect(out[2].packageCode).toBe("EXISTING");
  });

  it("leaves non-matching rooms untouched (no new rows added)", () => {
    const out = overlayPackageForecast(clients, [{ roomNumber: "999", packageCode: "BKF" }]);
    expect(out).toHaveLength(3);
    expect(out[0].packageCode).toBe("");
  });

  it("resolves the R118 scenario: 36 VIP guests get their breakfast flags", () => {
    const vipGuests = Array.from({ length: 36 }, (_, i) => ({
      roomNumber: String(100 + i),
      name: `Guest ${i}`,
      packageCode: "",
    }));
    const forecast = vipGuests.map((g) => ({ roomNumber: g.roomNumber, packageCode: "BKF INC" }));

    const out = overlayPackageForecast(vipGuests, forecast);
    const withoutPackage = out.filter((c) => !c.packageCode).length;
    expect(withoutPackage).toBe(0); // was 36 "sans forfait", now 0
  });

  it("is a no-op when there are no forecast rows", () => {
    expect(overlayPackageForecast(clients, [])).toBe(clients);
  });

  it("does not mutate the input array", () => {
    const snapshot = JSON.parse(JSON.stringify(clients));
    overlayPackageForecast(clients, [{ roomNumber: "101", packageCode: "BKF" }]);
    expect(clients).toEqual(snapshot);
  });
});
