import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";

// Ensure Web Crypto (subtle) is available under the jsdom test env.
if (!(globalThis as unknown as { crypto?: Crypto }).crypto?.subtle) {
  (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
}

import {
  deriveLocationKeys,
  encryptField,
  decryptField,
  blindIndex,
  newLocationSalt,
} from "@/lib/crypto/field-crypto";

describe("zero-knowledge field crypto", () => {
  const salt = newLocationSalt(); // per-run salt, reused across the suite

  it("encrypt → decrypt round-trips with the same code", async () => {
    const { dek } = await deriveLocationKeys("COURT-1234", salt);
    const ct = await encryptField(dek, "Martin Dupont");
    expect(ct).not.toContain("Martin"); // stored value is ciphertext
    expect(await decryptField(dek, ct)).toBe("Martin Dupont");
  });

  it("two encryptions of the same value differ (random IV) but both decrypt", async () => {
    const { dek } = await deriveLocationKeys("COURT-1234", salt);
    const a = await encryptField(dek, "Sarah Lemoine");
    const b = await encryptField(dek, "Sarah Lemoine");
    expect(a).not.toBe(b);
    expect(await decryptField(dek, a)).toBe("Sarah Lemoine");
    expect(await decryptField(dek, b)).toBe("Sarah Lemoine");
  });

  it("a WRONG code cannot decrypt — the zero-knowledge property", async () => {
    const { dek } = await deriveLocationKeys("COURT-1234", salt);
    const ct = await encryptField(dek, "Allergie: fruits à coque");
    const { dek: wrong } = await deriveLocationKeys("WRONG-9999", salt);
    await expect(decryptField(wrong, ct)).rejects.toThrow();
  });

  it("blind index: deterministic + normalized, not reversible, differs by code", async () => {
    const { indexKey } = await deriveLocationKeys("COURT-1234", salt);
    const i1 = await blindIndex(indexKey, "Martin Dupont");
    const i2 = await blindIndex(indexKey, "  martin   DUPONT ");
    expect(i1).toBe(i2); // normalized → still searchable
    expect(i1.toLowerCase()).not.toContain("martin"); // one-way digest
    const { indexKey: other } = await deriveLocationKeys("OTHER-0000", salt);
    expect(await blindIndex(other, "Martin Dupont")).not.toBe(i1);
  });

  it("newLocationSalt produces distinct 16-byte salts", () => {
    const s1 = newLocationSalt();
    const s2 = newLocationSalt();
    expect(s1).not.toBe(s2);
    expect(atob(s1).length).toBe(16);
  });
});
