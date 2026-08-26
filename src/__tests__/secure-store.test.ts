/**
 * The roster — guest names and room numbers — encrypted at rest.
 *
 * Guest notes were already encrypted; the roster was not. That asymmetry was
 * the largest remaining gap in the audit: the allergy a receptionist TYPED was
 * protected, while the same allergy arriving on the VIP sheet sat in plaintext
 * beside the guest's name.
 *
 * The hard constraint is that `storage.ts` is synchronous and is read on the
 * search path during service. So this store keeps a synchronous API over an
 * in-memory mirror, hydrated once when the app opens, and persists encrypted
 * in the background.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  SECURE_KEYS,
  isSecureKey,
  hydrateSecureStore,
  secureGet,
  secureSet,
  secureRemove,
  secureKeys,
  flushSecureStore,
  getHydrationMs,
  __resetSecureStore,
} from "@/lib/secure-store";
import { __resetKeyCache } from "@/lib/notes-crypto";

beforeEach(() => {
  localStorage.clear();
  __resetKeyCache();
  __resetSecureStore();
});

describe("which keys are protected", () => {
  it("covers every store that holds a guest or employee name", () => {
    expect([...SECURE_KEYS].sort()).toEqual(
      ["dailyData_", "guest_profiles", "morningBrief_", "sessionHistory"].sort()
    );
  });

  it("recognises both exact keys and prefixed ones", () => {
    expect(isSecureKey("sessionHistory")).toBe(true);
    expect(isSecureKey("dailyData_2026-08-23")).toBe(true);
    expect(isSecureKey("morningBrief_2026-08-23")).toBe(true);
    expect(isSecureKey("guest_profiles")).toBe(true);
  });

  it("leaves settings, the audit logs and the already-encrypted notes alone", () => {
    // Settings hold no personal data. The audit logs hold a salted hash and
    // must stay independently readable — they are the evidence that survives an
    // erasure. Notes have their own envelope already.
    for (const k of ["app_settings", "app-lang", "app-dark", "access_log", "purge_log", "gn_abc", "gn_salt"]) {
      expect(isSecureKey(k), `${k} should not be re-encrypted here`).toBe(false);
    }
  });
});

describe("round trip", () => {
  it("reads back what it wrote", async () => {
    secureSet("sessionHistory", JSON.stringify([{ date: "2026-08-23" }]));
    await flushSecureStore();
    expect(JSON.parse(secureGet("sessionHistory")!)[0].date).toBe("2026-08-23");
  });

  it("survives a reload — hydrate recovers it from disk", async () => {
    secureSet("dailyData_2026-08-23", JSON.stringify({ clients: [{ name: "DUPONT, Marie" }] }));
    await flushSecureStore();

    __resetSecureStore();
    expect(secureGet("dailyData_2026-08-23")).toBeNull(); // not hydrated yet
    await hydrateSecureStore();
    expect(secureGet("dailyData_2026-08-23")).toContain("DUPONT");
  });

  it("removes a key from both memory and disk", async () => {
    secureSet("dailyData_2026-08-23", "{}");
    await flushSecureStore();
    secureRemove("dailyData_2026-08-23");
    await flushSecureStore();
    expect(secureGet("dailyData_2026-08-23")).toBeNull();
    expect(localStorage.getItem("dailyData_2026-08-23")).toBeNull();
  });

  it("lists its keys, so the purge and erasure can enumerate them", async () => {
    secureSet("dailyData_2026-08-01", "{}");
    secureSet("dailyData_2026-08-02", "{}");
    secureSet("sessionHistory", "[]");
    await flushSecureStore();
    expect(secureKeys("dailyData_").sort()).toEqual(["dailyData_2026-08-01", "dailyData_2026-08-02"]);
  });
});

describe("what actually lands on disk", () => {
  it("writes no guest name in the clear", async () => {
    secureSet("dailyData_2026-08-23", JSON.stringify({
      clients: [{ roomNumber: "412", name: "DUPONT, Marie", vipNotes: "allergie arachide" }],
    }));
    await flushSecureStore();
    const raw = localStorage.getItem("dailyData_2026-08-23")!;
    expect(raw).not.toMatch(/DUPONT|Marie|arachide/i);
  });

  it("writes no room number in the clear", async () => {
    secureSet("sessionHistory", JSON.stringify([{ clients: [{ roomNumber: "412" }] }]));
    await flushSecureStore();
    expect(localStorage.getItem("sessionHistory")).not.toMatch(/412/);
  });

  it("is smaller than the plaintext it replaces", async () => {
    // The envelope gzips before encrypting. On a full house this is a large
    // reduction, and iPad storage pressure is a real failure mode for this app.
    const big = JSON.stringify(
      Array.from({ length: 400 }, (_, i) => ({
        roomNumber: String(100 + i), name: "DUPONT, MARIE", packageCode: "BKF INC",
        arrivalDate: "11/03/26", departureDate: "14/03/26", adults: 2, children: 0,
      }))
    );
    secureSet("sessionHistory", big);
    await flushSecureStore();
    expect(localStorage.getItem("sessionHistory")!.length).toBeLessThan(big.length);
  });
});

describe("migrating a device that already has plaintext data", () => {
  it("picks up existing plaintext and re-writes it encrypted", async () => {
    // Every tablet in service today has plaintext. Hydration must adopt it, not
    // ignore it — ignoring it would look exactly like every guest disappearing.
    localStorage.setItem("sessionHistory", JSON.stringify([{ date: "2026-08-20", clients: [] }]));
    await hydrateSecureStore();

    expect(JSON.parse(secureGet("sessionHistory")!)[0].date).toBe("2026-08-20");
    await flushSecureStore();
    expect(localStorage.getItem("sessionHistory")).not.toMatch(/2026-08-20/);
  });

  it("keeps a plaintext day that is not valid JSON rather than destroying it", async () => {
    localStorage.setItem("dailyData_2026-08-23", "{ truncated");
    await hydrateSecureStore();
    expect(secureGet("dailyData_2026-08-23")).toBe("{ truncated");
  });

  it("is safe to run twice", async () => {
    localStorage.setItem("sessionHistory", JSON.stringify([{ date: "2026-08-20" }]));
    await hydrateSecureStore();
    await flushSecureStore();
    await hydrateSecureStore();
    expect(JSON.parse(secureGet("sessionHistory")!)[0].date).toBe("2026-08-20");
  });
});

describe("timing", () => {
  it("reports how long the unlock took, so it can be shown on the real tablet", async () => {
    localStorage.setItem("sessionHistory", JSON.stringify([{ date: "2026-08-20" }]));
    await hydrateSecureStore();
    expect(getHydrationMs()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(getHydrationMs())).toBe(true);
  });
});

describe("reads are synchronous", () => {
  it("returns a value without awaiting, once hydrated", async () => {
    // The search page reads this inside a useMemo during service. If it were
    // async the whole morning path would have to change.
    secureSet("sessionHistory", "[]");
    const value = secureGet("sessionHistory");
    expect(value).toBe("[]");
  });
});
