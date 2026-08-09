import { describe, it, expect } from "vitest";
import { sidebarDocked, sidebarShows } from "@/lib/guest-sidebar";

/**
 * A guest screen that showed nothing about a guest who had already been served.
 *
 * The Activité panel had two rules and both forgot today. It docked open when
 * the guest had past stays or notes, and it rendered today's entries only in
 * the branch for guests WITH past stays. So a first-time guest who had already
 * come down got a collapsed panel, and opening it showed "Aucune visite
 * précédente" and nothing else — while their check-in sat in the day's data.
 *
 * Reception's read of that is "the app lost my check-in", and the undo button
 * that would fix a mis-tap lived in the block that was never drawn.
 *
 * Today is the whole point of the screen. It is never the thing that gets
 * dropped.
 */
describe("sidebarDocked", () => {
  it("opens for a returning guest", () => {
    expect(sidebarDocked({ pastStays: 3, notes: 0, todayEntries: 0 })).toBe(true);
  });

  it("opens for a first-time guest with a note — the allergy case", () => {
    expect(sidebarDocked({ pastStays: 0, notes: 1, todayEntries: 0 })).toBe(true);
  });

  it("opens for a first-time guest who has already come down", () => {
    // The reported bug: checked in, no history, no note — panel stayed shut.
    expect(sidebarDocked({ pastStays: 0, notes: 0, todayEntries: 1 })).toBe(true);
  });

  it("stays collapsed only when there is genuinely nothing to say", () => {
    expect(sidebarDocked({ pastStays: 0, notes: 0, todayEntries: 0 })).toBe(false);
  });
});

describe("sidebarShows", () => {
  it("shows today's entries to a first-time guest who has come down", () => {
    const s = sidebarShows({ tab: "all", pastStays: 0, todayEntries: 2 });
    expect(s.todayActivity).toBe(true);
  });

  it("shows today's entries to a returning guest too — one rule, not two", () => {
    const s = sidebarShows({ tab: "all", pastStays: 4, todayEntries: 2 });
    expect(s.todayActivity).toBe(true);
  });

  it("only claims no previous visit when today is also empty", () => {
    // "Aucune visite précédente" above a check-in made ten minutes ago is the
    // sentence that made reception doubt the record.
    expect(sidebarShows({ tab: "all", pastStays: 0, todayEntries: 1 }).emptyState).toBe(false);
    expect(sidebarShows({ tab: "all", pastStays: 0, todayEntries: 0 }).emptyState).toBe(true);
  });

  it("marks a first visit as a first visit whatever happened today", () => {
    expect(sidebarShows({ tab: "all", pastStays: 0, todayEntries: 3 }).firstVisitBadge).toBe(true);
    expect(sidebarShows({ tab: "all", pastStays: 1, todayEntries: 3 }).firstVisitBadge).toBe(false);
  });

  it("shows the stays list only when there are stays", () => {
    expect(sidebarShows({ tab: "all", pastStays: 2, todayEntries: 0 }).pastStays).toBe(true);
    expect(sidebarShows({ tab: "all", pastStays: 0, todayEntries: 0 }).pastStays).toBe(false);
  });

  it("keeps the notes digest to the Tout tab, where it always was", () => {
    expect(sidebarShows({ tab: "all", pastStays: 0, todayEntries: 0 }).notesDigest).toBe(true);
    expect(sidebarShows({ tab: "visites", pastStays: 0, todayEntries: 0 }).notesDigest).toBe(false);
  });

  it("keeps today's entries on the Visites tab — a visit today is a visit", () => {
    expect(sidebarShows({ tab: "visites", pastStays: 0, todayEntries: 1 }).todayActivity).toBe(true);
  });
});
