import { describe, it, expect } from "vitest";
import {
  makeNote,
  sortNotes,
  pinnedStrip,
  compactNotes,
  applyEdit,
  filterNotes,
  shouldPinByDefault,
  MAX_TITLE,
  MAX_BODY,
  MAX_NOTES_PER_GUEST,
  MAX_REVISIONS,
  type GuestNote,
  type NoteTone,
} from "@/lib/notes";

const T0 = "2026-07-01T08:00:00.000Z";

function note(over: Partial<GuestNote> & { tone?: NoteTone } = {}): GuestNote {
  return makeNote(
    {
      tone: over.tone ?? "info",
      title: over.title ?? "Titre",
      body: over.body ?? "Corps",
      author: over.author ?? "Sofia",
      pinned: over.pinned,
    },
    { now: over.updatedAt ?? T0, id: over.id }
  );
}

describe("tone defaults", () => {
  // A guest's allergy is worthless if nobody sees it. Alert and Event are the
  // two tones that are actionable *during* the check-in, so they pin
  // themselves — reception should never have to remember to pin an allergy.
  it("pins alert and event by default", () => {
    expect(shouldPinByDefault("alert")).toBe(true);
    expect(shouldPinByDefault("event")).toBe(true);
  });

  it("leaves the informational tones unpinned by default", () => {
    expect(shouldPinByDefault("preference")).toBe(false);
    expect(shouldPinByDefault("loyalty")).toBe(false);
    expect(shouldPinByDefault("info")).toBe(false);
  });

  it("applies the default when the caller does not specify pinned", () => {
    expect(note({ tone: "alert" }).pinned).toBe(true);
    expect(note({ tone: "info" }).pinned).toBe(false);
  });

  it("lets an explicit pinned:false override the default", () => {
    expect(note({ tone: "alert", pinned: false }).pinned).toBe(false);
  });
});

describe("sort order", () => {
  it("puts alerts first even when a later note is pinned", () => {
    const notes = [
      note({ id: "b", tone: "preference", pinned: true, updatedAt: "2026-07-05T08:00:00.000Z" }),
      note({ id: "a", tone: "alert", pinned: false, updatedAt: "2026-07-01T08:00:00.000Z" }),
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("orders pinned above unpinned once alerts are placed", () => {
    const notes = [
      note({ id: "plain", tone: "info", pinned: false, updatedAt: "2026-07-09T08:00:00.000Z" }),
      note({ id: "pin", tone: "info", pinned: true, updatedAt: "2026-07-02T08:00:00.000Z" }),
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["pin", "plain"]);
  });

  it("breaks ties by most recently updated", () => {
    const notes = [
      note({ id: "old", tone: "info", updatedAt: "2026-07-01T08:00:00.000Z" }),
      note({ id: "new", tone: "info", updatedAt: "2026-07-08T08:00:00.000Z" }),
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the array it is given", () => {
    const notes = [note({ id: "x", tone: "info" }), note({ id: "y", tone: "alert" })];
    const before = notes.map((n) => n.id);
    sortNotes(notes);
    expect(notes.map((n) => n.id)).toEqual(before);
  });
});

describe("the pinned strip on the check-in card", () => {
  it("carries every pinned note — the row scrolls, so nothing is dropped", () => {
    const notes = Array.from({ length: 5 }, (_, i) =>
      note({ id: `n${i}`, tone: "info", pinned: true, updatedAt: `2026-07-0${i + 1}T08:00:00.000Z` })
    );
    expect(pinnedStrip(notes)).toHaveLength(5);
  });

  it("excludes unpinned notes", () => {
    expect(pinnedStrip([note({ tone: "info", pinned: false })])).toHaveLength(0);
  });

  // The safety property the old cap existed to protect, and the only one this
  // function still owes: an allergy is on screen before anyone scrolls.
  it("puts an alert first however many preferences precede it", () => {
    const notes = [
      ...Array.from({ length: 6 }, (_, i) =>
        note({ id: `p${i}`, tone: "preference", pinned: true, updatedAt: `2026-07-1${i}T08:00:00.000Z` })
      ),
      note({ id: "allergy", tone: "alert", pinned: true, updatedAt: "2026-07-01T08:00:00.000Z" }),
    ];
    expect(pinnedStrip(notes)[0].id).toBe("allergy");
  });

  it("keeps every alert ahead of every non-alert", () => {
    const notes = [
      note({ id: "i1", tone: "info", pinned: true, updatedAt: "2026-07-20T08:00:00.000Z" }),
      ...Array.from({ length: 4 }, (_, i) =>
        note({ id: `a${i}`, tone: "alert", pinned: true, updatedAt: `2026-07-0${i + 1}T08:00:00.000Z` })
      ),
    ];
    const tones = pinnedStrip(notes).map((n) => n.tone);
    expect(tones.lastIndexOf("alert")).toBeLessThan(tones.indexOf("info"));
  });
});

describe("filtering", () => {
  const notes = [
    note({ id: "a", tone: "alert" }),
    note({ id: "p", tone: "preference" }),
    note({ id: "l", tone: "loyalty" }),
  ];

  it("returns everything for 'all'", () => {
    expect(filterNotes(notes, "all")).toHaveLength(3);
  });

  it("returns only the requested tone", () => {
    expect(filterNotes(notes, "alert").map((n) => n.id)).toEqual(["a"]);
  });

  it("returns sorted results", () => {
    expect(filterNotes(notes, "all")[0].id).toBe("a");
  });
});

describe("validation and caps", () => {
  it("rejects a note with neither title nor body", () => {
    expect(() => makeNote({ tone: "info", title: "  ", body: "", author: "S" })).toThrow();
  });

  it("accepts a note with only a title", () => {
    expect(makeNote({ tone: "info", title: "Sans gluten", body: "", author: "S" }).title).toBe("Sans gluten");
  });

  it("truncates an over-long title rather than throwing", () => {
    const n = makeNote({ tone: "info", title: "x".repeat(MAX_TITLE + 50), body: "", author: "S" });
    expect(n.title).toHaveLength(MAX_TITLE);
  });

  it("truncates an over-long body", () => {
    const n = makeNote({ tone: "info", title: "t", body: "y".repeat(MAX_BODY + 500), author: "S" });
    expect(n.body).toHaveLength(MAX_BODY);
  });

  it("falls back to a safe tone when given an unknown one", () => {
    const n = makeNote({ tone: "banana" as NoteTone, title: "t", body: "", author: "S" });
    expect(n.tone).toBe("info");
  });

  it("gives every note a distinct id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeNote({ tone: "info", title: "t", body: "", author: "S" }).id));
    expect(ids.size).toBe(200);
  });
});

describe("compaction", () => {
  it("keeps the note count under the per-guest cap", () => {
    const many = Array.from({ length: MAX_NOTES_PER_GUEST + 25 }, (_, i) =>
      note({ id: `n${i}`, tone: "info", updatedAt: `2026-07-01T08:00:${String(i).padStart(2, "0")}.000Z` })
    );
    expect(compactNotes(many)).toHaveLength(MAX_NOTES_PER_GUEST);
  });

  it("drops the least important notes, never an alert", () => {
    const many = [
      ...Array.from({ length: MAX_NOTES_PER_GUEST + 10 }, (_, i) =>
        note({ id: `n${i}`, tone: "info", updatedAt: `2026-07-01T08:00:${String(i).padStart(2, "0")}.000Z` })
      ),
      note({ id: "allergy", tone: "alert", updatedAt: "2020-01-01T00:00:00.000Z" }),
    ];
    expect(compactNotes(many).map((n) => n.id)).toContain("allergy");
  });

  it("trims the revision trail", () => {
    let n = note({ tone: "info" });
    for (let i = 0; i < MAX_REVISIONS + 12; i++) {
      n = applyEdit(n, { title: `v${i}` }, "Sofia", { now: `2026-07-01T09:${String(i).padStart(2, "0")}:00.000Z` });
    }
    expect(compactNotes([n])[0].revisions.length).toBeLessThanOrEqual(MAX_REVISIONS);
  });
});

describe("editing", () => {
  it("records who changed what and when", () => {
    const n = note({ tone: "info", title: "Avant" });
    const edited = applyEdit(n, { title: "Après" }, "Marc", { now: "2026-07-02T10:00:00.000Z" });
    expect(edited.title).toBe("Après");
    expect(edited.updatedAt).toBe("2026-07-02T10:00:00.000Z");
    expect(edited.revisions.at(-1)).toMatchObject({ author: "Marc", at: "2026-07-02T10:00:00.000Z" });
  });

  it("preserves the original author and creation time", () => {
    const n = note({ tone: "info", author: "Sofia" });
    const edited = applyEdit(n, { title: "Après" }, "Marc", { now: "2026-07-02T10:00:00.000Z" });
    expect(edited.author).toBe("Sofia");
    expect(edited.createdAt).toBe(n.createdAt);
  });

  it("does not mutate the original note", () => {
    const n = note({ tone: "info", title: "Avant" });
    applyEdit(n, { title: "Après" }, "Marc");
    expect(n.title).toBe("Avant");
  });

  it("records a pin change as a revision", () => {
    const n = note({ tone: "info", pinned: false });
    const edited = applyEdit(n, { pinned: true }, "Marc");
    expect(edited.pinned).toBe(true);
    expect(edited.revisions.at(-1)?.summary).toMatch(/épingl/i);
  });

  it("writes no revision when nothing actually changed", () => {
    const n = note({ tone: "info", title: "Même" });
    expect(applyEdit(n, { title: "Même" }, "Marc").revisions).toHaveLength(n.revisions.length);
  });
});
