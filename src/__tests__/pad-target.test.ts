import { describe, it, expect } from "vitest";
import { padTarget } from "@/lib/pad-target";

/**
 * The pad always types. Always.
 *
 * The bug, exactly: the pad routes to a note draft whenever one exists, and a
 * draft outlives the screen it was written on. Start a note on a guest's card,
 * then tap a metric pill — the slot swaps to the list, the note editor is gone,
 * the draft is not. Every digit after that went into an invisible text box.
 * From the desk: the keypad stopped working, with a queue in front of it, and
 * nothing on screen to explain it or undo it. Only a reload cleared it.
 *
 * The rule is not "is there a draft" but "is there an editor on screen to type
 * into". A note is always about a guest, so no guest means no editor, whatever
 * state got left behind.
 */
describe("padTarget", () => {
  it("types into the search field when nothing else is open", () => {
    expect(padTarget({ draft: null, hasGuest: false })).toBe("search");
    expect(padTarget({ draft: null, hasGuest: true })).toBe("search");
  });

  it("types into a note while one is open on a guest", () => {
    expect(padTarget({ draft: { text: "pas de fruits" }, hasGuest: true })).toBe("note");
  });

  it("NEVER swallows a keystroke into a draft with no guest on screen", () => {
    // This is the whole bug. A draft left over from a guest who is no longer
    // resolved must not eat the digits meant for the next room.
    expect(padTarget({ draft: { text: "pas de fruits" }, hasGuest: false })).toBe("search");
  });

  it("has no third answer — every keystroke lands somewhere", () => {
    for (const draft of [null, { text: "" }, { text: "x" }]) {
      for (const hasGuest of [true, false]) {
        expect(["note", "search"]).toContain(padTarget({ draft, hasGuest }));
      }
    }
  });
});
