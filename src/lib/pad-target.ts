/**
 * Where a key goes. The pad always types — always.
 *
 * The app owns the keyboard, so the pad is the ONLY way to put a character on
 * this screen. That makes a swallowed keystroke not a glitch but a dead tablet:
 * reception is standing with a queue, pressing a number, and nothing happens.
 *
 * It happened. The pad routed to a note draft whenever one existed, and a draft
 * outlives the screen it was written on — start a note on a guest, tap a metric
 * pill, and the editor is gone while the draft is not. Every digit after that
 * went into an invisible text box, until someone reloaded the app.
 *
 * So the question is never "is there a draft" but "is there an editor on screen
 * to type into". A note is always about a guest: no guest, no editor, whatever
 * state was left behind.
 */

export function padTarget({
  draft,
  hasGuest,
}: {
  draft: { text: string } | null | undefined;
  /** A guest is resolved and their card — which carries the note editor — is
   *  the thing on screen. */
  hasGuest: boolean;
}): "note" | "search" {
  return draft && hasGuest ? "note" : "search";
}
