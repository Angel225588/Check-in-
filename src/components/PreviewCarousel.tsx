"use client";
import { useState, useEffect, useRef } from "react";

export interface Pane {
  key: string;
  label: string;
  node: React.ReactNode;
}

const AUTO_MS = 8000;
/** After a manual swipe or tap, auto-advance stays out of the way this long. */
const PAUSE_MS = 20000;
const SWIPE_PX = 44;

/**
 * The box above the keypad: one slot, several faces.
 *
 * Two rules decide everything here. It rotates on its own ONLY while idle — the
 * moment a room resolves, this is a decision surface, and a panel that moves
 * while someone reads it produces wrong check-ins. And every pane is reachable
 * by tapping a dot as well as by swiping: a swipe is fast for whoever learns
 * it, the dots are why a new hire on their second shift can still find the
 * notes.
 */
export default function PreviewCarousel({
  panes,
  auto,
  resetKey,
}: {
  panes: Pane[];
  /** Idle only. Never true while a guest is on screen. */
  auto: boolean;
  /** Changing this snaps back to the first pane — e.g. a new room. */
  resetKey: string;
}) {
  const [i, setI] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const startX = useRef<number | null>(null);

  useEffect(() => { setI(0); }, [resetKey]);

  useEffect(() => {
    if (!auto || panes.length < 2) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil) return;
      setI((n) => (n + 1) % panes.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [auto, panes.length, pausedUntil]);

  const go = (n: number) => {
    setI(((n % panes.length) + panes.length) % panes.length);
    setPausedUntil(Date.now() + PAUSE_MS);
  };

  if (panes.length === 0) return null;
  const active = panes[Math.min(i, panes.length - 1)];

  return (
    <div
      className="relative flex-1 min-h-[158px] flex flex-col"
      data-role="preview-carousel"
      data-pane={active.key}
      onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => {
        const x0 = startX.current;
        startX.current = null;
        if (x0 === null || panes.length < 2) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) < SWIPE_PX) return;
        go(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div key={active.key} className="flex-1 min-h-0 flex flex-col animate-[cardIn_.24s_cubic-bezier(.2,.9,.25,1)]">
        {active.node}
      </div>

      {panes.length > 1 && (
        <div className="shrink-0 flex justify-center items-center gap-1 pt-1.5" data-role="preview-dots">
          {panes.map((p, n) => (
            <button
              key={p.key}
              onClick={() => go(n)}
              aria-label={p.label}
              aria-current={n === i}
              /* The dot is 6px; the target around it is 44. */
              className="w-11 h-8 grid place-items-center"
            >
              <i
                className="block rounded-full transition-all duration-200"
                style={{
                  width: n === i ? 18 : 6,
                  height: 6,
                  background: n === i ? "var(--color-brand)" : "var(--tab-idle)",
                  opacity: n === i ? 0.95 : 0.35,
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
