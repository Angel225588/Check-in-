/**
 * Data minimisation (Art. 5(1)(c)): four fields were extracted from Marriott
 * rosters, stored, and never used for anything — not rendered, not decided on.
 * Collecting them was pure risk with no product in return, so they are gone.
 *
 * These tests are a ratchet. The fields are easy to re-add by copying an OCR
 * prompt, and nothing else would notice.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..");

const REMOVED_FIELDS = ["confirmationNumber", "rtc", "reservationStatus", "roomType"] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

describe("the removed fields are gone from the application", () => {
  it.each(REMOVED_FIELDS)("%s is never stored or read as a field", (field) => {
    // Looks for the field as a property — `rtc:` or `.rtc` — rather than the
    // bare word. The word legitimately survives in header-matching patterns
    // (parser.ts skips a header row containing "RTC", and mistral-parser
    // classifies a "Room Type" column so it is not misread as the room
    // number). Recognising a column is not storing it; the distinction is the
    // whole point, so the test has to make it too.
    const asProperty = new RegExp(`(?:\\.${field}\\b|\\b${field}\\s*:)`);
    const offenders = FILES.filter((f) => {
      const code = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return asProperty.test(code);
    }).map((f) => path.relative(SRC, f));
    expect(offenders, `${field} still stored or read in: ${offenders.join(", ")}`).toEqual([]);
  });

  it.each(REMOVED_FIELDS)("%s is not a property of any stored type", (field) => {
    const types = readFileSync(path.join(SRC, "lib/types.ts"), "utf8");
    expect(new RegExp(`\\b${field}\\s*[?]?:`).test(types)).toBe(false);
  });
});

describe("the fields that earn their place are still here", () => {
  const KEPT = [
    // rateCode and the dates key the group blocks in groups.ts and are rendered.
    "rateCode", "arrivalDate", "departureDate",
    // packageCode IS the entitlement status — the thing the app decides on.
    "packageCode", "roomNumber", "name", "adults", "children",
  ];
  it.each(KEPT)("%s is still used", (field) => {
    const used = FILES.some((f) => new RegExp(`\\b${field}\\b`).test(readFileSync(f, "utf8")));
    expect(used, `${field} disappeared — that is a regression, not minimisation`).toBe(true);
  });
});

describe("deduplication still works without the confirmation number", () => {
  it("treats the same guest in the same room as one row", async () => {
    const { dedupClients } = await import("@/lib/ocr-helpers");
    const rows = [
      { roomNumber: "412", name: "DUPONT, Marie", adults: 2 },
      { roomNumber: "412", name: "DUPONT, Marie", adults: 2 },
    ];
    expect(dedupClients(rows)).toHaveLength(1);
  });

  it("keeps two different guests sharing a room as separate rows", async () => {
    // A shared room with two names is two entitlements, and the app has always
    // kept them apart. The dedup key must not merge them now that the
    // confirmation number is no longer part of it.
    const { dedupClients } = await import("@/lib/ocr-helpers");
    const rows = [
      { roomNumber: "412", name: "DUPONT, Marie", adults: 1 },
      { roomNumber: "412", name: "DUPONT, Pierre", adults: 1 },
    ];
    expect(dedupClients(rows)).toHaveLength(2);
  });

  it("keeps the same name in two different rooms as separate rows", async () => {
    const { dedupClients } = await import("@/lib/ocr-helpers");
    const rows = [
      { roomNumber: "412", name: "DUPONT, Marie", adults: 1 },
      { roomNumber: "108", name: "DUPONT, Marie", adults: 1 },
    ];
    expect(dedupClients(rows)).toHaveLength(2);
  });
});
