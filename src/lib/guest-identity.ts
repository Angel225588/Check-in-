/**
 * Who counts as the same guest.
 *
 * One definition, used everywhere the app has to recognise a person across two
 * sheets of paper or across two stays: arrival habits (`expected-soon`) and
 * guest notes (`notes-store`). Two definitions would mean a guest whose habit
 * the app remembers but whose allergy it does not.
 *
 * The rules come from the documents reception actually uploads. The same
 * person, on the same morning, is printed three ways:
 *
 *   R118 breakfast roster   WU, TUNG-AN
 *   Guest InHouse VIP       WU,TUNG-AN
 *   a hurried manual entry  Wu Tung-An
 *
 * So punctuation, case, accents and token order are all noise. What is left —
 * the set of letters in the name — is the guest.
 *
 * The known cost: two unrelated people who genuinely share a name share an
 * identity. The room number would separate them, and the room number is
 * precisely what cannot be in here — it changes every stay, which is the bug
 * this function exists to end. A shared note on a shared name is a visible,
 * correctable annoyance at the desk; a note that vanished is not.
 */

/**
 * Titles the property management system appends, in the languages the real
 * exports actually use. Taken from one morning's VIP list: "SHEN,JIA,Mrs",
 * "YANG,YI,Mr", "DIERSCH,JENNIFER,Ms", "ENGELS,DANNY,HER",
 * "LOPEZ CRUZ,CARLOS ARIEL,SIGNOR" — and none of those titles appear on the
 * breakfast roster for the same guest. A title in the identity would split one
 * person into two, which is the bug this module exists to end.
 */
const HONORIFICS = new Set([
  "MR", "MRS", "MS", "MISS", "MSTR", "DR", "PROF", "SIR", "LADY", "LORD",
  "MME", "MLLE", "MONSIEUR", "MADAME", "HERR", "HER", "FRAU",
  "SIGNOR", "SIGNORA", "SIG", "SR", "SRA", "SRTA", "DON", "DONA",
]);

/**
 * The identity string for a guest name. Stable, printable, and safe to hash.
 * Returns "" for anything that is not a name — callers must treat that as
 * "no identity" rather than as a bucket to write into.
 */
export function guestIdentity(name: string): string {
  const tokens = (name || "")
    .normalize("NFD")
    // Strip combining marks: MÜLLER and MULLER are one guest.
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    // Commas, slashes, hyphens and dots are layout, not identity.
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = tokens.filter(
    // A lone letter is an initial. "JOHNSON, EMMA R." and "JOHNSON, EMMA" are
    // the same guest printed by two reports with different column widths.
    (t) => t.length > 1 && !HONORIFICS.has(t)
  );

  // Never let the filters empty a name out. A guest genuinely called "Mr" is
  // absurd, but returning "" for them would silently pool them with every
  // other unnamed row.
  return (meaningful.length ? meaningful : tokens)
    // Sorted, so "WU, TUNG-AN" and "TUNG-AN WU" are the same person. The
    // arrivals list and the VIP list do not agree on which name leads.
    .sort()
    .join(" ");
}

/** True when a name carries enough to identify anyone at all. */
export function hasGuestIdentity(name: string): boolean {
  return guestIdentity(name).length > 0;
}
