"use client";
import { Warning, Heart, Medal, Confetti, Info } from "@phosphor-icons/react/dist/ssr";
import type { NoteTone } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";

const ICONS = { warning: Warning, heart: Heart, medal: Medal, confetti: Confetti, info: Info } as const;

/** Real iconography, never emoji — an emoji renders as a different glyph on
 *  every OS and breaks apart at the sizes this app uses. */
export default function NoteToneIcon({
  tone,
  size = 16,
  color,
}: {
  tone: NoteTone;
  size?: number;
  color?: string;
}) {
  const meta = toneMeta(tone);
  const Icon = ICONS[meta.icon];
  return <Icon weight="duotone" size={size} color={color ?? meta.color} />;
}
