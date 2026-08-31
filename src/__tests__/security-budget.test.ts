/**
 * Fix: a hard monthly spend cap on AI calls, per property and global, that
 * fails closed with a clear error rather than silently spending.
 *
 * Priced to Mistral's shape: OCR bills per page, chat bills per token.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MemorySpendLedger,
  reserve,
  commit,
  release,
  ocrCost,
  chatCost,
  worstCaseCost,
  periodKey,
  secondsUntilPeriodReset,
  getCaps,
  type SpendLedgerStore,
} from "@/lib/security/budget";

const CAPS = { globalMonthlyUsd: 10, propertyMonthlyUsd: 4 };
const NOW = Date.UTC(2026, 7, 15, 12, 0, 0); // 2026-08-15
const PERIOD = "2026-08";

let ledger: MemorySpendLedger;
beforeEach(() => {
  ledger = new MemorySpendLedger();
});

describe("cost model", () => {
  it("scales OCR linearly with pages, because that is how it bills", () => {
    expect(ocrCost(10)).toBeCloseTo(ocrCost(1) * 10, 12);
    expect(ocrCost(0)).toBe(0);
  });

  it("never returns a negative cost for nonsense input", () => {
    expect(ocrCost(-5)).toBe(0);
    expect(chatCost(-1, -1)).toBe(0);
  });

  it("charges chat output above chat input, per token", () => {
    expect(chatCost(0, 1_000_000)).toBeGreaterThan(chatCost(1_000_000, 0));
  });

  it("includes both halves in a route's worst case", () => {
    const ocrOnly = worstCaseCost({ ocrPages: 5, chatCalls: 0 });
    const withChat = worstCaseCost({ ocrPages: 5, chatCalls: 1 });
    expect(withChat).toBeGreaterThan(ocrOnly);
  });

  it("keys periods by UTC month", () => {
    expect(periodKey(NOW)).toBe(PERIOD);
    expect(periodKey(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12");
  });

  it("reports seconds until the month rolls over", () => {
    const s = secondsUntilPeriodReset(Date.UTC(2026, 7, 31, 23, 59, 0));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(60);
  });
});

describe("reserve / commit / release", () => {
  it("allows spend while under both caps", async () => {
    const r = await reserve(ledger, { propertyCode: "p1", amount: 0.5 }, CAPS, NOW);
    expect(r.ok).toBe(true);
  });

  it("refuses once the property cap is reached, naming which", async () => {
    expect((await reserve(ledger, { propertyCode: "p1", amount: 3.9 }, CAPS, NOW)).ok).toBe(true);
    const second = await reserve(ledger, { propertyCode: "p1", amount: 1 }, CAPS, NOW);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("property_cap_reached");
      expect(second.retryAfter).toBeGreaterThan(0);
    }
  });

  it("refuses on the global cap even when each property is under its own", async () => {
    let denied = 0;
    for (let i = 0; i < 8; i++) {
      const r = await reserve(
        ledger,
        { propertyCode: `hotel-${i}`, amount: 3 },
        { globalMonthlyUsd: 10, propertyMonthlyUsd: 100 },
        NOW
      );
      if (!r.ok) {
        expect(r.reason).toBe("global_cap_reached");
        denied++;
      }
    }
    expect(denied).toBeGreaterThan(0);
  });

  it("does not keep budget for a request it denied", async () => {
    await reserve(
      ledger,
      { propertyCode: "p", amount: 999 },
      { globalMonthlyUsd: 1, propertyMonthlyUsd: 1 },
      NOW
    );
    expect(await ledger.get("global", PERIOD)).toBeCloseTo(0, 12);
    expect(await ledger.get("property:p", PERIOD)).toBeCloseTo(0, 12);
  });

  it("reconciles down to the real cost on commit", async () => {
    const r = await reserve(ledger, { propertyCode: "p", amount: 2 }, CAPS, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await commit(ledger, r, 0.25);
    expect(await ledger.get("global", PERIOD)).toBeCloseTo(0.25, 12);
    expect(await ledger.get("property:p", PERIOD)).toBeCloseTo(0.25, 12);
  });

  it("gives the whole reservation back on release", async () => {
    const r = await reserve(ledger, { propertyCode: "p", amount: 2 }, CAPS, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await release(ledger, r);
    expect(await ledger.get("global", PERIOD)).toBeCloseTo(0, 12);
    expect(await ledger.get("property:p", PERIOD)).toBeCloseTo(0, 12);
  });

  it("stops concurrent requests collectively overshooting the cap", async () => {
    // The reason for reserve-then-commit: twenty simultaneous requests that
    // each merely checked the balance would all see room.
    const caps = { globalMonthlyUsd: 1, propertyMonthlyUsd: 1 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserve(ledger, { propertyCode: "p", amount: 0.2 }, caps, NOW)
      )
    );
    expect(results.some((r) => !r.ok)).toBe(true);
    expect(await ledger.get("global", PERIOD)).toBeLessThanOrEqual(caps.globalMonthlyUsd);
  });

  it("isolates one property's spend from another's", async () => {
    await reserve(ledger, { propertyCode: "a", amount: 3.9 }, CAPS, NOW);
    expect((await reserve(ledger, { propertyCode: "b", amount: 0.1 }, CAPS, NOW)).ok).toBe(true);
  });

  it("starts fresh in a new month", async () => {
    const caps = { globalMonthlyUsd: 1, propertyMonthlyUsd: 1 };
    expect((await reserve(ledger, { propertyCode: "p", amount: 5 }, caps, NOW)).ok).toBe(false);
    const september = await reserve(
      ledger,
      { propertyCode: "p", amount: 0.5 },
      caps,
      Date.UTC(2026, 8, 1)
    );
    expect(september.ok).toBe(true);
  });
});

describe("fails closed", () => {
  const broken: SpendLedgerStore = {
    async addAndGet() {
      throw new Error("ledger down");
    },
    async get() {
      throw new Error("ledger down");
    },
  };

  it("refuses to spend when the ledger cannot be read or written", async () => {
    const r = await reserve(broken, { propertyCode: "p", amount: 0.01 }, CAPS, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ledger_unavailable");
  });

  it("does not throw out of commit or release when the ledger is down", async () => {
    const held = { ok: true as const, amount: 1, propertyCode: "p", period: PERIOD };
    await expect(commit(broken, held, 0.5)).resolves.toBeUndefined();
    await expect(release(broken, held)).resolves.toBeUndefined();
  });
});

describe("configured caps", () => {
  it("defaults to a finite cap, with the property cap at or below global", () => {
    const caps = getCaps();
    expect(Number.isFinite(caps.globalMonthlyUsd)).toBe(true);
    expect(caps.globalMonthlyUsd).toBeGreaterThan(0);
    expect(caps.propertyMonthlyUsd).toBeLessThanOrEqual(caps.globalMonthlyUsd);
  });
});
