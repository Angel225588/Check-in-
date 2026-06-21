import { describe, it, expect } from "vitest";
import { verifyAfterWrite, VerifyError, ConfigError } from "../lib/verify-after-write";

// Minimal mock of the supabase query builder chain used by verifyAfterWrite.
function mockSb(result: { data: unknown; error: unknown }) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => result,
  };
  return { from: () => q } as never;
}

describe("verifyAfterWrite (landed-not-equal)", () => {
  it("resolves when the live row is at our rev", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: { id: "x", client_rev: 5, deleted_at: null }, error: null }), {
        table: "clients", id: "x", ourRev: 5,
      })
    ).resolves.toBeUndefined();
  });

  it("RESOLVES when a newer writer overwrote us (we lost LWW = success, not failure)", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: { id: "x", client_rev: 9, deleted_at: null }, error: null }), {
        table: "clients", id: "x", ourRev: 5,
      })
    ).resolves.toBeUndefined();
  });

  it("throws VerifyError when the row did not land (null read)", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: null, error: null }), { table: "clients", id: "x", ourRev: 5 })
    ).rejects.toBeInstanceOf(VerifyError);
  });

  it("throws VerifyError when the live rev is behind ours (write lost)", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: { id: "x", client_rev: 3, deleted_at: null }, error: null }), {
        table: "clients", id: "x", ourRev: 5,
      })
    ).rejects.toBeInstanceOf(VerifyError);
  });

  it("tombstone: resolves when deleted_at present, throws when absent", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: { id: "x", client_rev: 6, deleted_at: "2026-06-21T00:00:00Z" }, error: null }), {
        table: "clients", id: "x", ourRev: 6, expectDeleted: true,
      })
    ).resolves.toBeUndefined();
    await expect(
      verifyAfterWrite(mockSb({ data: { id: "x", client_rev: 6, deleted_at: null }, error: null }), {
        table: "clients", id: "x", ourRev: 6, expectDeleted: true,
      })
    ).rejects.toBeInstanceOf(VerifyError);
  });

  it("RLS denial (42501) is a ConfigError — no retry", async () => {
    await expect(
      verifyAfterWrite(mockSb({ data: null, error: { code: "42501", message: "denied" } }), {
        table: "clients", id: "x", ourRev: 5,
      })
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
