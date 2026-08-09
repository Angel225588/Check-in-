/**
 * What the guest screen's Activité panel opens with, and what it draws.
 *
 * Both rules used to be written inline and both forgot the same thing. The
 * panel docked open for a guest with past stays or notes, and it rendered
 * today's entries only inside the branch for guests WITH past stays. A
 * first-time guest who had already come down therefore got a panel that was
 * shut, and — when opened — said "Aucune visite précédente" over a check-in
 * made ten minutes earlier. The undo that would fix a mis-tap was in the block
 * that never rendered.
 *
 * Today is what the screen is for. It is the one thing that is never dropped,
 * whichever branch a guest falls into.
 */

export type SideTab = "all" | "visites" | "notes";

export interface GuestActivity {
  /** Nights this guest has stayed with us before today. */
  pastStays: number;
  notes: number;
  /** Check-ins recorded for this guest today. */
  todayEntries: number;
}

/**
 * Whether the panel is open when the screen loads.
 *
 * Collapsed is right only when the column would be empty — an empty column is
 * just width taken from the card. Anything the panel could say earns it.
 */
export function sidebarDocked({ pastStays, notes, todayEntries }: GuestActivity): boolean {
  return pastStays > 0 || notes > 0 || todayEntries > 0;
}

export interface SidebarSections {
  firstVisitBadge: boolean;
  /** Today's check-ins, each with its undo. */
  todayActivity: boolean;
  notesDigest: boolean;
  /** The measured arrival hour and the usual formule — both need a history. */
  habits: boolean;
  pastStays: boolean;
  /** "Aucune visite précédente", which is only true when today is empty too. */
  emptyState: boolean;
}

export function sidebarShows({
  tab,
  pastStays,
  todayEntries,
}: {
  tab: SideTab;
  pastStays: number;
  todayEntries: number;
}): SidebarSections {
  const firstVisit = pastStays === 0;
  return {
    firstVisitBadge: firstVisit,
    // On both tabs: a visit that happened this morning is a visit, and the
    // "Visites" tab denying it is how the record came to look wrong.
    todayActivity: todayEntries > 0,
    notesDigest: tab === "all",
    habits: !firstVisit,
    pastStays: pastStays > 0,
    emptyState: firstVisit && todayEntries === 0,
  };
}
