import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  guestKey,
  loadNotes,
  addNote,
  updateNote,
  deleteNote,
  togglePin,
  NOTES_KEY_PREFIX,
} from "@/lib/notes-store";
import { __resetKeyCache } from "@/lib/notes-crypto";

const ROOM = "524";
const NAME = "POLANCO/ANTHONIO";

beforeEach(() => {
  localStorage.clear();
  __resetKeyCache();
});

describe("the storage key itself leaks nothing", () => {
  // localStorage keys show up in devtools, in exported profiles, and in any
  // backup tooling. A key of `notes_524_POLANCO` would defeat the encryption
  // of the value it points at.
  it("contains neither the room number nor the guest name", async () => {
    const k = await guestKey(ROOM, NAME);
    expect(k).not.toContain(ROOM);
    expect(k.toUpperCase()).not.toContain("POLANCO");
    expect(k.toUpperCase()).not.toContain("ANTHONIO");
  });

  it("is a fixed-length opaque hex digest", async () => {
    expect(await guestKey(ROOM, NAME)).toMatch(/^[0-9a-f]{16,}$/);
  });

  it("is stable for the same guest", async () => {
    expect(await guestKey(ROOM, NAME)).toBe(await guestKey(ROOM, NAME));
  });

  it("ignores case and stray whitespace, as the rest of the app does", async () => {
    expect(await guestKey(ROOM, "  polanco/anthonio  ")).toBe(await guestKey(ROOM, NAME));
  });

  it("separates two guests sharing a room", async () => {
    expect(await guestKey(ROOM, "DUPONT/MARIE")).not.toBe(await guestKey(ROOM, NAME));
  });

  it("separates the same name in two different rooms", async () => {
    expect(await guestKey("101", NAME)).not.toBe(await guestKey("202", NAME));
  });
});

describe("what actually lands in localStorage", () => {
  it("writes no note text in the clear", async () => {
    await addNote(ROOM, NAME, {
      tone: "alert",
      title: "Allergie arachide",
      body: "Choc anaphylactique — EpiPen dans le sac",
      author: "Sofia",
    });
    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain("Allergie");
    expect(dump).not.toContain("arachide");
    expect(dump).not.toContain("EpiPen");
    expect(dump).not.toContain("anaphylactique");
  });

  // Asserted by SHAPE, not by substring.
  //
  // The keys are salted hex digests, and a 3-digit room number turns up inside
  // 32 hex characters by coincidence roughly one run in thirty — this test
  // failed exactly that way, on a digest containing "…1524ce…" for room 524.
  // A safety test that cries wolf gets re-run until it passes, which is worse
  // than not having it.
  //
  // Proving every key IS a digest is also strictly stronger than proving one
  // string is absent: a room number written literally cannot match the shape,
  // whatever else it collides with.
  it("writes no guest identity in the clear", async () => {
    await addNote(ROOM, NAME, { tone: "info", title: "Test", body: "", author: "Sofia" });
    const keys = Object.keys(localStorage);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).toMatch(/^gn_(salt|[0-9a-f]{16,})$/);
    }
    // And nothing identifying survives once the digests themselves are removed.
    const outsideDigests = keys.map((k) => k.replace(/[0-9a-f]{16,}/g, "")).join(" ");
    expect(outsideDigests).not.toContain(ROOM);
    expect(outsideDigests.toUpperCase()).not.toContain("POLANCO");
    expect(outsideDigests.toUpperCase()).not.toContain("ANTHONIO");
  });

  it("namespaces its keys so it cannot collide with session data", async () => {
    await addNote(ROOM, NAME, { tone: "info", title: "Test", body: "", author: "Sofia" });
    const keys = Object.keys(localStorage);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith(NOTES_KEY_PREFIX))).toBe(true);
  });
});

describe("nothing reaches the console", () => {
  let spies: ReturnType<typeof vi.spyOn>[] = [];
  let seen: string[] = [];

  beforeEach(() => {
    seen = [];
    const capture = (...a: unknown[]) => { seen.push(a.map(String).join(" ")); };
    spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(capture)
    );
  });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  it("stays silent about note content across the whole CRUD cycle", async () => {
    let notes = await addNote(ROOM, NAME, {
      tone: "alert",
      title: "Allergie arachide",
      body: "EpiPen dans le sac",
      author: "Sofia",
    });
    notes = await updateNote(ROOM, NAME, notes[0].id, { body: "Mise à jour secrète" }, "Marc");
    notes = await togglePin(ROOM, NAME, notes[0].id, "Marc");
    await deleteNote(ROOM, NAME, notes[0].id);

    const out = seen.join("\n");
    expect(out).not.toContain("Allergie");
    expect(out).not.toContain("EpiPen");
    expect(out).not.toContain("secrète");
    expect(out).not.toContain("POLANCO");
    expect(out).not.toContain("524");
  });

  it("stays silent when the stored blob is corrupt", async () => {
    const k = await guestKey(ROOM, NAME);
    localStorage.setItem(NOTES_KEY_PREFIX + k, "v1.corrompu.corrompu");
    await loadNotes(ROOM, NAME);
    expect(seen.join("\n")).not.toContain("corrompu");
  });
});

describe("CRUD behaviour", () => {
  it("starts empty for an unknown guest", async () => {
    expect(await loadNotes("999", "INCONNU/X")).toEqual([]);
  });

  it("round-trips a note through storage", async () => {
    await addNote(ROOM, NAME, { tone: "alert", title: "Allergie", body: "arachide", author: "Sofia" });
    const back = await loadNotes(ROOM, NAME);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ tone: "alert", title: "Allergie", body: "arachide", author: "Sofia" });
  });

  it("keeps two guests' notes apart", async () => {
    await addNote(ROOM, NAME, { tone: "info", title: "A", body: "", author: "S" });
    await addNote(ROOM, "DUPONT/MARIE", { tone: "info", title: "B", body: "", author: "S" });
    expect((await loadNotes(ROOM, NAME)).map((n) => n.title)).toEqual(["A"]);
    expect((await loadNotes(ROOM, "DUPONT/MARIE")).map((n) => n.title)).toEqual(["B"]);
  });

  it("edits in place without creating a duplicate", async () => {
    const [n] = await addNote(ROOM, NAME, { tone: "info", title: "Avant", body: "", author: "S" });
    const after = await updateNote(ROOM, NAME, n.id, { title: "Après" }, "Marc");
    expect(after).toHaveLength(1);
    expect(after[0].title).toBe("Après");
    expect((await loadNotes(ROOM, NAME))[0].title).toBe("Après");
  });

  it("deletes only the requested note", async () => {
    const first = await addNote(ROOM, NAME, { tone: "info", title: "Garder", body: "", author: "S" });
    const both = await addNote(ROOM, NAME, { tone: "info", title: "Jeter", body: "", author: "S" });
    const target = both.find((n) => n.title === "Jeter")!;
    const left = await deleteNote(ROOM, NAME, target.id);
    expect(left.map((n) => n.title)).toEqual(["Garder"]);
    expect(first).toHaveLength(1);
  });

  it("is a no-op when deleting an id that does not exist", async () => {
    await addNote(ROOM, NAME, { tone: "info", title: "Garder", body: "", author: "S" });
    expect(await deleteNote(ROOM, NAME, "inexistant")).toHaveLength(1);
  });

  it("toggles pin state and persists it", async () => {
    const [n] = await addNote(ROOM, NAME, { tone: "info", title: "T", body: "", author: "S" });
    expect(n.pinned).toBe(false);
    await togglePin(ROOM, NAME, n.id, "Marc");
    expect((await loadNotes(ROOM, NAME))[0].pinned).toBe(true);
  });
});

describe("hostile input", () => {
  it("stores a script payload as inert text, not markup", async () => {
    const xss = '<img src=x onerror="alert(1)">';
    await addNote(ROOM, NAME, { tone: "info", title: xss, body: xss, author: "S" });
    const back = await loadNotes(ROOM, NAME);
    // It comes back as the literal characters the user typed. React escapes it
    // on render; what matters here is that we never turned it into HTML.
    expect(back[0].title).toBe(xss);
    expect(typeof back[0].body).toBe("string");
  });

  it("survives a JSON-breaking payload", async () => {
    const evil = '{"a":1}\\" </script>';
    await addNote(ROOM, NAME, { tone: "info", title: evil, body: "", author: "S" });
    expect((await loadNotes(ROOM, NAME))[0].title).toBe(evil);
  });

  it("returns an empty list rather than throwing on a corrupt blob", async () => {
    const k = await guestKey(ROOM, NAME);
    localStorage.setItem(NOTES_KEY_PREFIX + k, "n'importe quoi");
    expect(await loadNotes(ROOM, NAME)).toEqual([]);
  });

  it("returns an empty list when the payload decrypts to the wrong shape", async () => {
    const k = await guestKey(ROOM, NAME);
    const { encryptString } = await import("@/lib/notes-crypto");
    localStorage.setItem(NOTES_KEY_PREFIX + k, await encryptString(JSON.stringify({ not: "an array" })));
    expect(await loadNotes(ROOM, NAME)).toEqual([]);
  });

  it("discards entries that are not well-formed notes", async () => {
    const k = await guestKey(ROOM, NAME);
    const { encryptString } = await import("@/lib/notes-crypto");
    localStorage.setItem(
      NOTES_KEY_PREFIX + k,
      await encryptString(JSON.stringify([{ id: "ok", tone: "info", title: "Bon", body: "", pinned: false, author: "S", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", revisions: [] }, null, 42, { junk: true }]))
    );
    const back = await loadNotes(ROOM, NAME);
    expect(back).toHaveLength(1);
    expect(back[0].title).toBe("Bon");
  });
});

describe("storage pressure", () => {
  it("reports failure instead of pretending a note was saved", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceededError"); };
    try {
      await expect(
        addNote(ROOM, NAME, { tone: "info", title: "T", body: "", author: "S" })
      ).rejects.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
