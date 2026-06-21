import { describe, it, expect, beforeEach } from "vitest";
import { cachedLocation } from "../lib/sync/session";

const CACHE_KEY = "imarketin_location_cache";

describe("session cache (offline display)", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is cached", () => {
    expect(cachedLocation()).toBeNull();
  });

  it("returns the cached location when present", () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ locationId: "loc-1", role: "staff", locationName: "Courtyard Demo" }));
    expect(cachedLocation()).toEqual({ locationId: "loc-1", role: "staff", locationName: "Courtyard Demo" });
  });

  it("survives a corrupt cache without throwing", () => {
    localStorage.setItem(CACHE_KEY, "{not json");
    expect(cachedLocation()).toBeNull();
  });
});
