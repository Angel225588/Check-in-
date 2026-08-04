"use client";
import { useEffect } from "react";
import {
  Clock, ChartBar, ArrowsHorizontal, Check, X, UploadSimple, HandSwipeRight,
} from "@phosphor-icons/react/dist/ssr";

/**
 * US-P4 — the service controls, as the drawer iOS already taught everyone.
 *
 * Portrait has no room for a 392px column of buttons, so the four landscape
 * controls move behind the burger. They keep their icons and their words:
 * the same tool must not introduce itself twice.
 *
 * Why glass here and nowhere else. The landscape app was made unusable on the
 * iPad by `backdrop-filter` — 170 blurred elements over a flat page, paying
 * full compositing cost for an effect that was invisible because there was
 * nothing behind them. A drawer is the one place the argument reverses: there
 * IS a screen behind it, staying visible is the whole point of a drawer rather
 * than a page, and it is one element rather than a hundred. Blur radius stays
 * modest and nothing else in the tree stacks on top of it.
 */
export default function NavDrawer({
  open,
  onClose,
  handSide,
  swipe,
  onRecents,
  onReport,
  onFlipSide,
  onSwipeToggle,
  onCloseDay,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  handSide: "left" | "right";
  swipe: boolean;
  onRecents: () => void;
  onReport: () => void;
  onFlipSide: () => void;
  onSwipeToggle: () => void;
  onCloseDay: () => void;
  onUpload: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const row =
    "w-full min-h-[60px] px-4 rounded-[16px] flex items-center gap-3.5 text-left transition-transform active:scale-[0.97]";
  const rowStyle = { background: "rgba(128,128,128,.09)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" };
  const label = "text-[15px] font-bold";

  /** Do it, then get out of the way — a drawer that stays open after a choice
   *  makes you dismiss it twice. */
  const pick = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex" data-role="nav-drawer" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 dark:bg-black/50 animate-[fadeIn_.18s_ease-out]" />

      <aside
        onClick={(e) => e.stopPropagation()}
        data-role="nav-drawer-panel"
        className="relative w-[min(310px,84vw)] h-full flex flex-col gap-2 p-3 pt-4 overflow-y-auto animate-[drawerIn_.24s_cubic-bezier(.2,.9,.25,1)]"
        style={{
          background: "var(--aur-drawer)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          boxShadow: "1px 0 0 var(--aur-hairline), 24px 0 60px -30px rgba(20,12,0,.5)",
        }}
      >
        <div className="flex items-center justify-between mb-1 px-1">
          <b className="text-[13px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--tab-idle)" }}>
            Service
          </b>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="w-11 h-11 -mr-1 rounded-full grid place-items-center active:scale-[0.92] transition-transform"
          >
            <X size={16} weight="bold" style={{ color: "var(--brand-ink)" }} />
          </button>
        </div>

        <button onClick={pick(onRecents)} data-role="drawer-recents" className={row} style={rowStyle}>
          <Clock size={21} weight="duotone" style={{ opacity: .75 }} />
          <span className={label} style={{ color: "var(--aur-ink-2)" }}>Récents</span>
        </button>

        <button onClick={pick(onReport)} data-role="drawer-report" className={row} style={rowStyle}>
          <ChartBar size={21} weight="duotone" style={{ opacity: .75 }} />
          <span className={label} style={{ color: "var(--aur-ink-2)" }}>Rapport</span>
        </button>

        {/* The two preferences stay open on purpose: flipping a switch and
            watching the drawer vanish hides whether it took. */}
        <button onClick={onFlipSide} data-role="drawer-hand" className={row} style={rowStyle}>
          <ArrowsHorizontal size={21} weight="bold" style={{ opacity: .75 }} />
          <span className={`${label} flex-1`} style={{ color: "var(--aur-ink-2)" }}>
            {handSide === "left" ? "Gaucher" : "Droitier"}
          </span>
        </button>

        <button
          onClick={onSwipeToggle}
          data-role="drawer-swipe"
          role="switch"
          aria-checked={swipe}
          className={row}
          style={rowStyle}
        >
          <HandSwipeRight size={21} weight="duotone" style={{ opacity: .75 }} />
          <span className={`${label} flex-1`} style={{ color: "var(--aur-ink-2)" }}>Balayage</span>
          {/* The state is in the switch, not in the word. */}
          <span
            aria-hidden
            className="shrink-0 w-[46px] h-[27px] rounded-full relative transition-colors"
            style={{ background: swipe ? "var(--aur-good)" : "rgba(128,128,128,.32)" }}
          >
            <i
              className="absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white transition-all"
              style={{ left: swipe ? 22 : 3, boxShadow: "0 1px 3px rgba(0,0,0,.28)" }}
            />
          </span>
        </button>

        <button onClick={pick(onUpload)} data-role="drawer-upload" className={row} style={rowStyle}>
          <UploadSimple size={21} weight="duotone" style={{ opacity: .75 }} />
          <span className={label} style={{ color: "var(--aur-ink-2)" }}>Charger la liste</span>
        </button>

        {/* Last, and tinted apart. Closing the day is the one thing here that
            cannot be undone by tapping it again. */}
        <button
          onClick={pick(onCloseDay)}
          data-role="drawer-close-day"
          className={`${row} mt-auto`}
          style={{ background: "var(--aur-bad-soft)", boxShadow: "inset 0 0 0 1px var(--aur-bad)" }}
        >
          <Check size={21} weight="bold" style={{ color: "var(--aur-bad-ink)" }} />
          <span className={label} style={{ color: "var(--aur-bad-ink)" }}>Clôture</span>
        </button>
      </aside>

      <style jsx>{`
        @keyframes drawerIn {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          aside, div { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
