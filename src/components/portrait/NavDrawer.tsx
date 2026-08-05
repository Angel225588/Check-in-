"use client";
import { useEffect } from "react";
import {
  Clock, ChartBar, ArrowsHorizontal, Check, X, UploadSimple, HandSwipeRight, ArrowUUpLeft,
} from "@phosphor-icons/react/dist/ssr";
import type { RecentEntry } from "@/components/PreviewPanes";

/**
 * US-P4 — the service controls, as the drawer iOS already taught everyone.
 *
 * The four landscape controls keep their icons, their words and their shape:
 * the same four tiles, in the same order, so the tool does not introduce
 * itself twice.
 *
 * Under them, the day itself. "Récents" used to be a tile that opened a
 * full-screen list — a button to reach a list, inside a drawer that is already
 * a list. Now the arrivals are simply there, newest first, and each one opens
 * that guest. The tile above it is gone, because a control that only reveals
 * what is already on screen is a control that costs a tap and returns nothing.
 *
 * Why glass here and nowhere else. The landscape app was made unusable on the
 * iPad by `backdrop-filter` — 170 blurred elements over a flat page, paying
 * full compositing cost for an effect that was invisible because there was
 * nothing behind them. A drawer is the one place the argument reverses: there
 * IS a screen behind it, staying visible is the whole point of a drawer rather
 * than a page, and it is one element rather than a hundred.
 */
export default function NavDrawer({
  open,
  onClose,
  handSide,
  swipe,
  recents,
  onPickRoom,
  onReport,
  onFlipSide,
  onSwipeToggle,
  onCloseDay,
  onUpload,
  onUndo,
}: {
  open: boolean;
  onClose: () => void;
  handSide: "left" | "right";
  swipe: boolean;
  /** The service so far, newest first. */
  recents: RecentEntry[];
  onPickRoom: (room: string) => void;
  onReport: () => void;
  onFlipSide: () => void;
  onSwipeToggle: () => void;
  onCloseDay: () => void;
  onUpload: () => void;
  onUndo?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  /** The landscape tile, at drawer width. */
  const tile =
    "min-h-[68px] rounded-[16px] flex flex-col items-center justify-center gap-1 surface-chrome " +
    "active:scale-[0.96] transition-transform";
  const tileLabel = "text-[10px] font-black uppercase tracking-[0.06em]";

  /** Do it, then get out of the way — a drawer that stays open after a choice
   *  makes you dismiss it twice. Preferences are the exception: flipping a
   *  switch and watching the drawer vanish hides whether it took. */
  const pick = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex" data-role="nav-drawer" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 dark:bg-black/50 animate-[fadeIn_.18s_ease-out]" />

      <aside
        onClick={(e) => e.stopPropagation()}
        data-role="nav-drawer-panel"
        className="relative w-[min(340px,88vw)] h-full flex flex-col p-3 pt-4 animate-[drawerIn_.24s_cubic-bezier(.2,.9,.25,1)]"
        style={{
          background: "var(--aur-drawer)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          boxShadow: "1px 0 0 var(--aur-hairline), 24px 0 60px -30px rgba(20,12,0,.5)",
        }}
      >
        <div className="shrink-0 flex items-center justify-between mb-2 px-1">
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

        {/* The same four, in the same order as the tablet lying down. */}
        <div className="shrink-0 grid grid-cols-4 gap-2" data-role="drawer-tiles">
          <button onClick={pick(onUpload)} data-role="drawer-upload" className={tile}>
            <UploadSimple size={19} weight="duotone" style={{ opacity: .75 }} />
            <span className={tileLabel} style={{ color: "var(--tab-idle)" }}>Liste</span>
          </button>
          <button onClick={pick(onReport)} data-role="drawer-report" className={tile}>
            <ChartBar size={19} weight="duotone" style={{ opacity: .75 }} />
            <span className={tileLabel} style={{ color: "var(--tab-idle)" }}>Rapport</span>
          </button>
          <button onClick={onFlipSide} data-role="drawer-hand" className={tile}>
            <ArrowsHorizontal size={19} weight="bold" style={{ opacity: .75 }} />
            <span className={tileLabel} style={{ color: "var(--tab-idle)" }}>
              {handSide === "left" ? "Gaucher" : "Droitier"}
            </span>
          </button>
          <button onClick={pick(onCloseDay)} data-role="drawer-close-day" className={tile}>
            <Check size={19} weight="bold" style={{ color: "var(--aur-bad-ink)" }} />
            <span className={tileLabel} style={{ color: "var(--aur-bad-ink)" }}>Clôture</span>
          </button>
        </div>

        {/* The day, right here. No tile in front of it. */}
        <div className="shrink-0 flex items-center justify-between mt-4 mb-1.5 px-1">
          <b className="text-[11px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-1.5"
            style={{ color: "var(--tab-idle)" }}>
            <Clock size={13} weight="duotone" /> Activité · {recents.length}
          </b>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1"
          data-role="drawer-recents"
          style={{ overscrollBehavior: "contain" }}
        >
          {recents.length === 0 && (
            <span className="text-[13px] font-semibold px-1 py-2" style={{ color: "var(--tab-idle)" }}>
              Personne n&apos;est encore entré.
            </span>
          )}
          {recents.map((r, i) => (
            <button
              key={`${r.roomNumber}-${i}`}
              type="button"
              data-role="drawer-recent-row"
              onClick={pick(() => onPickRoom(r.roomNumber))}
              className="w-full text-left min-h-[52px] px-3 rounded-[12px] flex items-center gap-3 transition-transform active:scale-[0.98]"
              style={{ background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
            >
              <em className="not-italic text-[12px] font-bold tabular-nums shrink-0" style={{ color: "var(--tab-idle)" }}>
                {r.at}
              </em>
              <b className="text-[17px] font-black tabular-nums shrink-0" style={{ color: "var(--brand-ink)" }}>
                {r.roomNumber}
              </b>
              <span className="flex-1 min-w-0 truncate text-[13px] font-bold" style={{ color: "var(--aur-ink-2)" }}>
                {r.name}
              </span>
              <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[12px] font-black tabular-nums"
                style={{ background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }}>
                {r.pax}
              </span>
            </button>
          ))}
        </div>

        {/* Preferences last, where a mis-tap costs nothing. */}
        <button
          onClick={onSwipeToggle}
          data-role="drawer-swipe"
          role="switch"
          aria-checked={swipe}
          className="shrink-0 mt-2 min-h-[52px] px-4 rounded-[14px] flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
          style={{ background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
        >
          <HandSwipeRight size={19} weight="duotone" style={{ opacity: .75 }} />
          <span className="flex-1 text-[14px] font-bold" style={{ color: "var(--aur-ink-2)" }}>Balayage</span>
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

        {onUndo && recents.length > 0 && (
          <button
            onClick={pick(onUndo)}
            data-role="drawer-undo"
            className="shrink-0 mt-2 min-h-[48px] px-4 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13px] font-black transition-transform active:scale-[0.98]"
            style={{ background: "var(--aur-bad-soft)", color: "var(--aur-bad-ink)" }}
          >
            <ArrowUUpLeft size={16} weight="bold" /> Corriger une entrée
          </button>
        )}
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
