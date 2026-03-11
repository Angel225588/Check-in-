import { describe, it, expect } from "vitest";
import { Client } from "@/lib/types";
import { mergeNewClients, MergeResult } from "@/lib/merge";

function makeClient(room: string, name: string, overrides?: Partial<Client>): Client {
  return {
    roomNumber: room,
    roomType: "",
    rtc: "",
    confirmationNumber: "",
    name,
    arrivalDate: "",
    departureDate: "",
    reservationStatus: "",
    adults: 1,
    children: 0,
    rateCode: "",
    packageCode: "",
    ...overrides,
  };
}

describe("mergeNewClients", () => {
  it("adds all new clients when existing is empty", () => {
    const incoming = [makeClient("101", "SMITH JOHN"), makeClient("102", "DOE JANE")];
    const result = mergeNewClients([], incoming);

    expect(result.merged).toHaveLength(2);
    expect(result.added).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.existing).toBe(0);
  });

  it("adds all new clients when there are no overlaps", () => {
    const existing = [makeClient("101", "SMITH JOHN")];
    const incoming = [makeClient("102", "DOE JANE"), makeClient("103", "BROWN BOB")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(3);
    expect(result.added).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.existing).toBe(1);
  });

  it("skips exact duplicates (same room + same name)", () => {
    const existing = [makeClient("101", "SMITH JOHN"), makeClient("102", "DOE JANE")];
    const incoming = [makeClient("101", "SMITH JOHN"), makeClient("103", "NEW GUY")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(3);
    expect(result.added).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.existing).toBe(2);
  });

  it("handles case-insensitive name matching", () => {
    const existing = [makeClient("101", "SMITH JOHN")];
    const incoming = [makeClient("101", "Smith John")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.added).toBe(0);
  });

  it("allows same room with different names (shared rooms)", () => {
    const existing = [makeClient("101", "SMITH JOHN")];
    const incoming = [makeClient("101", "SMITH SARAH")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(2);
    expect(result.added).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);
  });

  it("preserves VIP flags on existing clients", () => {
    const existing = [makeClient("101", "SMITH JOHN", { isVip: true, vipLevel: "X4" })];
    const incoming = [makeClient("101", "SMITH JOHN")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].isVip).toBe(true);
    expect(result.merged[0].vipLevel).toBe("X4");
  });

  it("preserves existing clients order, appends new at end", () => {
    const existing = [makeClient("101", "FIRST"), makeClient("102", "SECOND")];
    const incoming = [makeClient("103", "THIRD"), makeClient("101", "FIRST")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(3);
    expect(result.merged[0].name).toBe("FIRST");
    expect(result.merged[1].name).toBe("SECOND");
    expect(result.merged[2].name).toBe("THIRD");
  });

  it("handles large batches (simulating 320 guests across multiple uploads)", () => {
    // First batch: rooms 100-199
    const batch1 = Array.from({ length: 100 }, (_, i) =>
      makeClient(String(100 + i), `GUEST ${100 + i}`)
    );
    // Second batch: rooms 150-249 (overlaps 150-199 with batch1)
    const batch2 = Array.from({ length: 100 }, (_, i) =>
      makeClient(String(150 + i), `GUEST ${150 + i}`)
    );

    const result = mergeNewClients(batch1, batch2);

    expect(result.existing).toBe(100);
    expect(result.duplicatesSkipped).toBe(50);
    expect(result.added).toBe(50);
    expect(result.merged).toHaveLength(150);
  });

  it("strips non-alpha characters for name matching", () => {
    const existing = [makeClient("101", "O'BRIAN, JOHN M.")];
    const incoming = [makeClient("101", "OBRIAN JOHN M")];
    const result = mergeNewClients(existing, incoming);

    expect(result.merged).toHaveLength(1);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it("returns empty merge when both lists are empty", () => {
    const result = mergeNewClients([], []);
    expect(result.merged).toHaveLength(0);
    expect(result.added).toBe(0);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.existing).toBe(0);
  });
});
