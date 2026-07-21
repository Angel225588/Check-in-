import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal sessionStorage mock
const store: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};
vi.stubGlobal("sessionStorage", sessionStorageMock);

import { stashSelection, readSelection, checkinHref } from "@/lib/checkin-nav";

describe("checkin-nav — PII-free routing", () => {
  beforeEach(() => sessionStorageMock.clear());

  it("round-trips a selection through an opaque token", () => {
    const token = stashSelection({ roomNumber: "203", ci: 4 });
    expect(readSelection(token)).toEqual({ roomNumber: "203", ci: 4 });
  });

  it("checkinHref never contains the room number", () => {
    const href = checkinHref("203", 4);
    expect(href.startsWith("/checkin/")).toBe(true);
    expect(href).not.toContain("203");
    // The token must resolve back to the room.
    const token = href.replace("/checkin/", "");
    expect(readSelection(token)?.roomNumber).toBe("203");
  });

  it("supports selections without an index", () => {
    const token = stashSelection({ roomNumber: "555" });
    expect(readSelection(token)).toEqual({ roomNumber: "555", ci: undefined });
  });

  it("returns null for an unknown or malformed token", () => {
    expect(readSelection("nope")).toBeNull();
    sessionStorageMock.setItem("checkin_sel_bad", "{not json");
    expect(readSelection("bad")).toBeNull();
    sessionStorageMock.setItem("checkin_sel_x", JSON.stringify({ noRoom: true }));
    expect(readSelection("x")).toBeNull();
  });

  it("issues distinct tokens for distinct selections", () => {
    const a = stashSelection({ roomNumber: "101" });
    const b = stashSelection({ roomNumber: "102" });
    expect(a).not.toBe(b);
    expect(readSelection(a)?.roomNumber).toBe("101");
    expect(readSelection(b)?.roomNumber).toBe("102");
  });
});
