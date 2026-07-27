import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  getNoteKey,
  encryptString,
  decryptString,
  __resetKeyCache,
} from "@/lib/notes-crypto";

beforeEach(() => {
  __resetKeyCache();
  localStorage.clear();
});

describe("key material", () => {
  it("produces an AES-GCM key", async () => {
    const k = await getNoteKey();
    expect(k.algorithm.name).toBe("AES-GCM");
  });

  // The whole point: an attacker who can run JS (XSS) or read the profile
  // directory still cannot lift the key out and decrypt a stolen dump.
  it("marks the key non-extractable", async () => {
    const k = await getNoteKey();
    expect(k.extractable).toBe(false);
  });

  it("refuses to export the key", async () => {
    const k = await getNoteKey();
    await expect(crypto.subtle.exportKey("raw", k)).rejects.toThrow();
  });

  it("returns the same key across calls so old notes stay readable", async () => {
    const a = await getNoteKey();
    __resetKeyCache();
    const b = await getNoteKey();
    const env = await encryptString("persistance");
    __resetKeyCache();
    expect(await decryptString(env)).toBe("persistance");
    expect(a.algorithm.name).toBe(b.algorithm.name);
  });
});

describe("roundtrip", () => {
  it("returns exactly what was encrypted", async () => {
    const plain = JSON.stringify({ tone: "alert", body: "Allergie arachide sévère" });
    expect(await decryptString(await encryptString(plain))).toBe(plain);
  });

  it("survives accents, emoji and newlines", async () => {
    const plain = "Préférence : chambre côté cour\nAnniversaire 🎉 le 12";
    expect(await decryptString(await encryptString(plain))).toBe(plain);
  });

  it("handles an empty string", async () => {
    expect(await decryptString(await encryptString(""))).toBe("");
  });

  it("handles a body at the size cap", async () => {
    const plain = "é".repeat(2000);
    expect(await decryptString(await encryptString(plain))).toBe(plain);
  });
});

describe("ciphertext hygiene", () => {
  it("leaks no plaintext into the stored envelope", async () => {
    const env = await encryptString("Allergie arachide sévère chambre 524 POLANCO");
    expect(env).not.toContain("Allergie");
    expect(env).not.toContain("arachide");
    expect(env).not.toContain("524");
    expect(env).not.toContain("POLANCO");
  });

  it("uses a fresh IV every write, so identical notes differ on disk", async () => {
    const a = await encryptString("même texte");
    const b = await encryptString("même texte");
    expect(a).not.toBe(b);
    expect(await decryptString(a)).toBe(await decryptString(b));
  });

  it("carries a version marker so the format can evolve", async () => {
    expect(await encryptString("x")).toMatch(/^v1/);
  });
});

describe("failing closed", () => {
  // A silently-wrong decrypt would show one guest's allergy on another guest's
  // screen. Every failure path must return null, never a guess.
  it("rejects a tampered ciphertext", async () => {
    const env = await encryptString("Allergie arachide");
    const parts = env.split(".");
    const body = parts[parts.length - 1];
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    parts[parts.length - 1] = flipped;
    expect(await decryptString(parts.join("."))).toBeNull();
  });

  it("rejects a tampered IV", async () => {
    const parts = (await encryptString("Allergie arachide")).split(".");
    parts[1] = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1);
    expect(await decryptString(parts.join("."))).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await decryptString("pas-du-tout-un-message")).toBeNull();
    expect(await decryptString("")).toBeNull();
    expect(await decryptString("v1..")).toBeNull();
  });

  it("rejects an unknown envelope version", async () => {
    const parts = (await encryptString("x")).split(".");
    parts[0] = "v99";
    expect(await decryptString(parts.join("."))).toBeNull();
  });

  it("rejects a ciphertext encrypted under a different key", async () => {
    const env = await encryptString("Allergie arachide");
    // Simulate another device's key by wiping the store the key lives in.
    indexedDB.deleteDatabase("checkin-notes-key");
    __resetKeyCache();
    expect(await decryptString(env)).toBeNull();
  });
});

describe("compaction", () => {
  it("stores repetitive text in less space than it occupies in the clear", async () => {
    const plain = "Petit-déjeuner en chambre. ".repeat(120);
    expect((await encryptString(plain)).length).toBeLessThan(plain.length);
  });

  it("roundtrips compacted text unchanged", async () => {
    const plain = "Petit-déjeuner en chambre. ".repeat(120);
    expect(await decryptString(await encryptString(plain))).toBe(plain);
  });
});
