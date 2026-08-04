"use client";
import { useState, useEffect, useRef } from "react";

export interface Pane {
  key: string;
  label: string;
  node: React.ReactNode;
  /** True when this face is a dark fill in BOTH themes — the gold VIP card.
   *  Everything else is a surface-card, which follows the theme. */
  onDark?: boolean;
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
 *
 * The dots sit ON the card rather than under it. As a separate row they added a
 * band of dead space between the preview and the keypad, on a screen where
 * vertical space is the scarcest thing there is.
 */
export default function PreviewCarousel({
  panes,
  auto,
  resetKey,
  action,
  swipe = true,
}: {
  panes: Pane[];
  /** Idle only. Never true while a guest is on screen. */
  auto: boolean;
  /** Changing this snaps back to the first pane — e.g. a new room. */
  resetKey: string;
  /** US-23. Reception can turn the gesture off when the tablet lies flat and
   *  gets brushed during service. The dots are unaffected, on purpose: nothing
   *  may become unreachable because a shortcut was declined. */
  swipe?: boolean;
  /** A control pinned to the frame, above every face. The slot is the one
   *  place the eye already is once a room resolves, so the fastest way to
   *  write a note is from here rather than two screens away. */
  action?: React.ReactNode;
}) {
  const [i, setI] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);

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

  const begin = (x: number, y: number) => {
    if (!swipe) return;
    startX.current = x;
    startY.current = y;
  };
  const end = (x: number, y: number) => {
    const x0 = startX.current;
    startX.current = null;
    if (x0 === null || panes.length < 2) return;
    const dx = x - x0;
    const dy = y - startY.current;
    if (Math.abs(dx) < SWIPE_PX) return;
    // The panes scroll, so a drag that is mostly vertical belongs to the list
    // inside the pane rather than to the carousel.
    if (Math.abs(dy) > Math.abs(dx)) return;
    go(i + (dx < 0 ? 1 : -1));
  };

  if (panes.length === 0) return null;
  const active = panes[Math.min(i, panes.length - 1)];

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col select-none"
      data-role="preview-carousel"
      data-pane={active.key}
      data-swipe={swipe ? "on" : "off"}
      /* pan-y, or the browser claims a horizontal drag as a scroll gesture and
         fires pointercancel — which is why swiping did nothing at all before
         while the dots worked fine. */
      style={{ touchAction: "pan-y" }}
      /* Touch events, not pointer events with setPointerCapture. Capture is
         what broke this on the iPad: iOS hands the gesture to its own scroll
         machinery and the captured pointerup never arrives, so the swipe was
         simply lost. Touch events still fire. The mouse keeps the pointer path,
         which is what the desktop and the test driver use. */
      onTouchStart={(e) => { begin(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchEnd={(e) => { end(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }}
      onTouchCancel={() => { startX.current = null; }}
      onPointerDown={(e) => { if (e.pointerType === "mouse") begin(e.clientX, e.clientY); }}
      onPointerUp={(e) => { if (e.pointerType === "mouse") end(e.clientX, e.clientY); }}
      onPointerCancel={() => { startX.current = null; }}
    >
      <div key={active.key} className="relative z-10 flex-1 min-h-0 flex flex-col animate-[cardIn_.24s_cubic-bezier(.2,.9,.25,1)]">
        {active.node}
      </div>

      {action && (
        <div className="absolute right-2.5 bottom-2 z-30" data-role="preview-action">
          {action}
        </div>
      )}

      {/* No scrim. It existed because white dots vanish on a light card, but a
          translucent black pill on a white card is a grey blob — and the card
          is a proper surface now. The dots take the theme's idle ink instead,
          which reads on the light card and on the dark one; only the gold VIP
          face, which is dark in both themes, forces white. */}
      {panes.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-1 z-20 flex justify-center items-center gap-0.5 pointer-events-none"
          data-role="preview-dots"
        >
          {panes.map((p, n) => (
            <button
              key={p.key}
              onClick={() => go(n)}
              aria-label={p.label}
              aria-current={n === i}
              /* The dot is 6px; the target around it is 44. */
              className="w-10 h-7 grid place-items-center pointer-events-auto"
            >
              <i
                className="block rounded-full transition-all duration-200"
                style={{
                  width: n === i ? 18 : 6,
                  height: 6,
                  background: active.onDark ? "#fff" : "var(--tab-idle)",
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
