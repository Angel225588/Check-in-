import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { guestIdentity } from "@/lib/guest-identity";
import { guestKey, loadNotes, addNote, NOTES_KEY_PREFIX } from "@/lib/notes-store";
import { __resetKeyCache } from "@/lib/notes-crypto";

beforeEach(() => {
  localStorage.clear();
  __resetKeyCache();
});

/**
 * The bug this file exists for.
 *
 * A note was addressed by `salt + room + name`. Rooms change every stay, so the
 * address changed with them and the note became unreachable — still on disk,
 * still encrypted, pointed at by a key nobody would ever compute again.
 *
 * A note belongs to the guest. That is the whole premise of a guest note, and
 * it is now the whole of the key.
 */
describe("a note belongs to the guest, not to the room", () => {
  it("resolves to the same key when the guest returns in another room", async () => {
    // SHEN, JIA — room 451 on 20/08, any other room next time.
    expect(await guestKey("SHEN, JIA")).toBe(await guestKey("SHEN, JIA"));
  });

  it("reads back a note written during a previous stay in a different room", async () => {
    await addNote("SHEN, JIA", {
      tone: "alert",
      title: "Allergie arachide",
      body: "Sévère — jamais de sauce satay",
      author: "Réception",
    });
    // Next stay. New room, new arrivals sheet, same person.
    const back = await loadNotes("SHEN, JIA");
    expect(back).toHaveLength(1);
    expect(back[0].title).toBe("Allergie arachide");
  });

  it("keeps two different guests apart", async () => {
    expect(await guestKey("SHEN, JIA")).not.toBe(await guestKey("WU, TUNG-AN"));
  });
});

/**
 * The two documents reception uploads spell the same guest differently. The
 * breakfast roster (R118) prints "WU, TUNG-AN"; the VIP list prints
 * "WU,TUNG-AN" with no space. Both are room 151 on 20/08/26 — one person.
 *
 * A key that distinguishes them is the same bug wearing a different hat.
 */
describe("the same person however the sheet spelled them", () => {
  it("collapses the roster and VIP spellings of one guest", async () => {
    const roster = await guestKey("WU, TUNG-AN");
    const vip = await guestKey("WU,TUNG-AN");
    expect(vip).toBe(roster);
  });

  it("ignores case, so a lowercased roster row is the same guest", async () => {
    expect(await guestKey("Wu, Tung-An")).toBe(await guestKey("WU, TUNG-AN"));
  });

  it("folds diacritics — MÜLLER and MULLER are one guest", async () => {
    expect(await guestKey("MÜLLER, JÖRG")).toBe(await guestKey("MULLER, JORG"));
  });

  it("ignores the order the sheet printed the parts in", async () => {
    expect(await guestKey("TUNG-AN WU")).toBe(await guestKey("WU, TUNG-AN"));
  });

  it("ignores the honorific the VIP list appends", () => {
    // Room 451 on 20/08/26, printed both ways on the same morning:
    //   Guest InHouse VIP    SHEN,JIA,Mrs
    //   R118 roster          SHEN, JIA
    // One guest. An earlier version of this test compared two spellings that
    // BOTH carried the honorific and passed while the bug was live.
    expect(guestIdentity("SHEN,JIA,Mrs")).toBe(guestIdentity("SHEN, JIA"));
    expect(guestIdentity("YANG,YI,Mr")).toBe(guestIdentity("YANG, YI"));
    expect(guestIdentity("LOPEZ CRUZ,CARLOS ARIEL,SIGNOR")).toBe(
      guestIdentity("LOPEZ CRUZ, CARLOS ARIEL")
    );
  });

  it("ignores a middle initial one report prints and the other does not", () => {
    expect(guestIdentity("JOHNSON, EMMA R.")).toBe(guestIdentity("JOHNSON, EMMA"));
  });

  it("still tells apart two guests who share a surname", () => {
    expect(guestIdentity("DIERSCH, JENNIFER")).not.toBe(guestIdentity("DIERSCH, MARTIN"));
  });
});

/**
 * The key is still a digest and must stay one. Changing what goes into it must
 * not quietly turn it back into something readable in devtools.
 */
describe("the key still leaks nothing", () => {
  it("carries no trace of the guest's name", async () => {
    const k = await guestKey("POLANCO/ANTHONIO");
    expect(k.toUpperCase()).not.toContain("POLANCO");
    expect(k.toUpperCase()).not.toContain("ANTHONIO");
  });

  it("is 32 hex characters, like every other note key", async () => {
    expect(await guestKey("SHEN, JIA")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("writes under the gn_ prefix and nowhere else", async () => {
    await addNote("SHEN, JIA", { tone: "info", title: "Test", body: "", author: "R" });
    const keys = Object.keys(localStorage).filter((k) => k !== `${NOTES_KEY_PREFIX}salt`);
    expect(keys.every((k) => k.startsWith(NOTES_KEY_PREFIX))).toBe(true);
  });
});

/**
 * A blank name must never become a shared bucket that pools notes from
 * unrelated guests. Refusing to store is the safe failure.
 */
describe("a nameless guest is not a guest", () => {
  it("refuses to write a note against an empty name", async () => {
    await expect(
      addNote("   ", { tone: "info", title: "x", body: "", author: "R" })
    ).rejects.toThrow();
  });

  it("returns nothing for an empty name rather than a shared pile", async () => {
    expect(await loadNotes("")).toEqual([]);
  });
});
