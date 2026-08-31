/**
 * The property code is assigned automatically. Nobody types anything.
 *
 * It scopes the spend cap and, once Supabase Auth lands, the tenant claim.
 * `PROPERTY_CODE` wins when set; otherwise it is derived from the host, so a
 * second hotel on its own domain gets its own scope with no setup step.
 */
import { describe, it, expect, afterEach } from "vitest";
import { derivePropertyCode, getPropertyCode } from "@/lib/security/config";
import { getCaps, budgetCurrency } from "@/lib/security/budget";

afterEach(() => {
  delete process.env.PROPERTY_CODE;
  delete process.env.AI_MONTHLY_BUDGET;
  delete process.env.AI_MONTHLY_BUDGET_PER_PROPERTY;
});

describe("derivation from the host", () => {
  it("takes the deployment name from a Vercel host", () => {
    expect(derivePropertyCode("check-in-pdj.vercel.app")).toBe("check-in-pdj");
  });

  it("takes the left-most label from a custom domain", () => {
    expect(derivePropertyCode("courtyard-paris.hotels.example.com")).toBe(
      "courtyard-paris"
    );
  });

  it("ignores the port", () => {
    expect(derivePropertyCode("check-in-pdj.vercel.app:443")).toBe("check-in-pdj");
  });

  it("is case-insensitive, so one hotel is one scope", () => {
    expect(derivePropertyCode("Check-In-PDJ.vercel.app")).toBe(
      derivePropertyCode("check-in-pdj.vercel.app")
    );
  });

  it("gives two hotels two scopes", () => {
    expect(derivePropertyCode("courtyard-paris.example.com")).not.toBe(
      derivePropertyCode("courtyard-lyon.example.com")
    );
  });

  it("keeps a preview deployment off the hotel's budget", () => {
    const preview = derivePropertyCode("check-in-pdj-git-myfeature-acme.vercel.app");
    expect(preview).not.toBe(derivePropertyCode("check-in-pdj.vercel.app"));
    expect(preview).toContain("preview");
  });

  it("gives repeated deploys of one branch the same scope", () => {
    // Otherwise every deploy would mint a fresh budget.
    expect(derivePropertyCode("check-in-pdj-git-myfeature-team1.vercel.app")).toBe(
      derivePropertyCode("check-in-pdj-git-myfeature-team2.vercel.app")
    );
  });

  it("falls back to a default for localhost, an IP, or nothing", () => {
    expect(derivePropertyCode("localhost:3123")).toBe("default");
    expect(derivePropertyCode("192.168.1.10")).toBe("default");
    expect(derivePropertyCode(null)).toBe("default");
    expect(derivePropertyCode("")).toBe("default");
  });

  it("never emits a code that is empty or unbounded", () => {
    for (const host of ["...", "-----.example.com", "x".repeat(300) + ".com"]) {
      const code = derivePropertyCode(host);
      expect(code.length).toBeGreaterThan(0);
      expect(code.length).toBeLessThanOrEqual(48);
    }
  });

  it("strips anything outside a safe slug", () => {
    expect(derivePropertyCode("hôtel_paris!.example.com")).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("explicit configuration wins", () => {
  it("uses PROPERTY_CODE when set, whatever the host", () => {
    process.env.PROPERTY_CODE = "courtyard-cdg";
    expect(getPropertyCode("anything.example.com")).toBe("courtyard-cdg");
  });

  it("derives from the host when it is not set", () => {
    expect(getPropertyCode("check-in-pdj.vercel.app")).toBe("check-in-pdj");
  });

  it("requires nobody to type anything in either case", () => {
    // The whole point: no setup screen, no code to lose, no morning blocked on
    // remembering one.
    expect(getPropertyCode("check-in-pdj.vercel.app")).toBeTruthy();
  });
});

describe("the monthly ceiling", () => {
  it("defaults to 100 overall and 50 for one hotel", () => {
    const caps = getCaps();
    expect(caps.globalMonthlyUsd).toBe(100);
    expect(caps.propertyMonthlyUsd).toBe(50);
  });

  it("keeps one hotel below the global ceiling", () => {
    const caps = getCaps();
    expect(caps.propertyMonthlyUsd).toBeLessThanOrEqual(caps.globalMonthlyUsd);
  });

  it("is overridable without touching code", () => {
    process.env.AI_MONTHLY_BUDGET = "250";
    process.env.AI_MONTHLY_BUDGET_PER_PROPERTY = "75";
    expect(getCaps()).toEqual({ globalMonthlyUsd: 250, propertyMonthlyUsd: 75 });
  });

  it("ignores junk rather than reading it as unlimited", () => {
    process.env.AI_MONTHLY_BUDGET = "not-a-number";
    expect(getCaps().globalMonthlyUsd).toBe(100);
    process.env.AI_MONTHLY_BUDGET = "-5";
    expect(getCaps().globalMonthlyUsd).toBe(100);
  });

  it("states its currency, so caps and prices share a unit", () => {
    expect(budgetCurrency()).toBe("EUR");
  });
});
