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
