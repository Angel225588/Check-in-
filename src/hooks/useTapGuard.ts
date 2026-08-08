"use client";
import { useRef } from "react";

/** Past this, the finger was going somewhere, not choosing something. */
const SLOP = 10;

/**
 * A tap is a tap. A swipe that happens to end on something is not.
 *
 * The browser fires `click` after a touch even when the finger travelled
 * across the screen, so the moment the carousel's faces and rows became
 * targets, every swipe across one of them also opened whatever it ended on —
 * a guest screen nobody asked for, mid-service, with a queue waiting.
 *
 * Spread these onto any element that both answers to a tap and lives inside
 * something you can swipe. The click still fires; it is simply ignored when
 * the finger moved far enough to have meant the gesture instead.
 */
export function useTapGuard(onTap: () => void) {
  const from = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      from.current = { x: e.clientX, y: e.clientY };
    },
    onClick: (e: React.MouseEvent) => {
      const start = from.current;
      from.current = null;
      // A keyboard-driven click reports 0,0 and has no start — let it through.
      if (start && (Math.abs(e.clientX - start.x) > SLOP || Math.abs(e.clientY - start.y) > SLOP)) return;
      onTap();
    },
  };
}
