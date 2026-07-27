/**
 * Presentation metadata for note tones.
 *
 * Kept out of `notes.ts` so the logic layer stays free of design concerns, and
 * kept out of the components so every surface (chip, list row, detail, filter)
 * agrees on what an alert looks like.
 *
 * Colours come from the `--aur-*` tokens rather than raw hex: a usability test
 * showed an Alert and a Preference reading as the same card when the only
 * difference was a 12px dot, so the tone now drives the colour of the whole
 * row.
 */

import type { NoteTone } from "./notes";

export interface ToneMeta {
  label: string;
  /** Solid colour for text and icons. */
  color: string;
  /** Translucent wash for backgrounds. */
  soft: string;
  /** Phosphor icon name, resolved by the component. */
  icon: "warning" | "heart" | "medal" | "confetti" | "info";
}

export const TONE_META: Record<NoteTone, ToneMeta> = {
  alert: { label: "Alerte", color: "var(--aur-bad)", soft: "var(--aur-bad-soft)", icon: "warning" },
  preference: { label: "Préférence", color: "var(--aur-info)", soft: "var(--aur-info-soft)", icon: "heart" },
  loyalty: { label: "Fidélité", color: "var(--aur-gold)", soft: "var(--aur-gold-soft)", icon: "medal" },
  event: { label: "Événement", color: "var(--aur-pm-points)", soft: "rgba(90,59,143,0.10)", icon: "confetti" },
  info: { label: "Info", color: "var(--tab-idle)", soft: "rgba(92,86,76,0.08)", icon: "info" },
};

export function toneMeta(tone: NoteTone): ToneMeta {
  return TONE_META[tone] ?? TONE_META.info;
}
