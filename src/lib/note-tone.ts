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
  /* Not `--tab-idle`: that is the colour of a chip nobody has chosen, so an
     Info chip that was chosen looked exactly like one that was not. */
  info: { label: "Info", color: "var(--aur-ink-2)", soft: "rgba(128,128,128,0.10)", icon: "info" },
};

export function toneMeta(tone: NoteTone): ToneMeta {
  return TONE_META[tone] ?? TONE_META.info;
}

/** The order the filter row offers, minus "all" which every caller prepends. */
export const TONES_FOR_CHIPS = ["alert", "preference", "loyalty", "event", "info"] as const;

export interface ChipStyle {
  background: string;
  color: string;
  boxShadow?: string;
}

/**
 * The filter chip, in one place because it is drawn in three.
 *
 * "Tout" was selected and invisible on the guest screen: #1C1C1C ink on a
 * near-black panel, ringed in `rgba(0,0,0,.25)` — a ring on black, drawn in
 * black. Every other chip was fine, and that is the tell: they take their
 * colour from a tone, and tones are `--aur-*` tokens that flip with the theme.
 * "Tout" has no tone, so it had been handed a literal — and a literal is a
 * colour that has only ever been checked against one background.
 *
 * So "Tout" gets a tone's treatment rather than a special case: the gold that
 * already means "this is the live one" everywhere else in the app. The idle
 * chip sits on neutral grey at low alpha, which reads on cream and on charcoal
 * alike; black at 4% is a smudge on one and nothing at all on the other.
 */
export function toneChipStyle(tone: NoteTone | "all", on: boolean): ChipStyle {
  if (!on) return { background: "rgba(128,128,128,.10)", color: "var(--tab-idle)" };
  if (tone === "all") {
    return {
      background: "var(--aur-gold-soft)",
      color: "var(--brand-ink)",
      boxShadow: "inset 0 0 0 1.5px var(--aur-gold)",
    };
  }
  const m = toneMeta(tone);
  return { background: m.soft, color: m.color, boxShadow: `inset 0 0 0 1.5px ${m.color}` };
}
