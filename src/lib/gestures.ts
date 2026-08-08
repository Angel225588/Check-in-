import { AppSettings } from "@/lib/types";

/**
 * US-23 — the gestures are an option, not a condition.
 *
 * The carousel's swipe is a nice surprise for whoever finds it, and a hazard
 * for a tablet lying flat on a counter being brushed by trays. Reception can
 * turn it off, exactly like the left/right hand setting, and nothing becomes
 * unreachable when they do: every face of the carousel is also on a dot.
 *
 * Default on. A setting saved before the toggle existed has no opinion, and
 * the app should not read silence as a refusal.
 */
export function swipeEnabled(settings: Partial<AppSettings> | null | undefined): boolean {
  return settings?.swipe !== false;
}

/**
 * US-25 / US-35 — the frame at rest.
 *
 * Default **off**, and the reversal is deliberate. It went on first because an
 * empty band above the pad looked unfinished; on the tablet, with a real day in
 * it, the answer came back the other way — "too big, hide it by default". At
 * rest reception is looking at the pad, not at a list of who already came.
 *
 * Off is not silence here: an unset preference means off, so the resting screen
 * is quiet until someone asks for it. The RESOLVED guest card is never
 * affected — that card carries the allergy, and US-2 exists so it cannot be
 * skipped.
 */
export function idlePreviewEnabled(settings: Partial<AppSettings> | null | undefined): boolean {
  return settings?.idlePreview === true;
}
