"use client";
import { useEffect } from "react";
import {
  Clock, ChartBar, ArrowsHorizontal, Check, X, UploadSimple, HandSwipeRight, Cards, ArrowsOutSimple,
} from "@phosphor-icons/react/dist/ssr";
import type { RecentEntry } from "@/components/PreviewPanes";
import ArrivalRow from "@/components/portrait/ArrivalRow";

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
  side,
  swipe,
  idlePreview,
  onIdlePreviewToggle,
  recents,
  onPickRoom,
  onReport,
  onFlipSide,
  onSwipeToggle,
  onCloseDay,
  onUpload,
  onUndoRow,
  onExpandActivity,
}: {
  open: boolean;
  onClose: () => void;
  handSide: "left" | "right";
  /** Which edge it comes from. Reception holds the tablet in whichever hand is
   *  free; a drawer that always opens on the left is a drawer a left-hander
   *  reaches across the screen for, every time. */
  side: "left" | "right";
  swipe: boolean;
  idlePreview: boolean;
  onIdlePreviewToggle: () => void;
  /** The service so far, newest first. */
  recents: RecentEntry[];
  onPickRoom: (room: string) => void;
  onReport: () => void;
  onFlipSide: () => void;
  onSwipeToggle: () => void;
  onCloseDay: () => void;
  onUpload: () => void;
  /** Undo one arrival, in place. The drawer used to carry a button to a screen
   *  whose only job was this — a trip to correct a typo you are looking at. */
  onUndoRow: (id: string) => void;
  /** The same list, full screen, with a search field and the lenses. */
  onExpandActivity: () => void;
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
    <div
      className={`fixed inset-0 z-50 flex ${side === "right" ? "justify-end" : ""}`}
      data-role="nav-drawer"
      data-side={side}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/25 dark:bg-black/50 animate-[fadeIn_.18s_ease-out]" />

      <aside
        onClick={(e) => e.stopPropagation()}
        data-role="nav-drawer-panel"
        className={`relative w-[min(340px,88vw)] h-full flex flex-col p-3 pt-4 ${
          side === "right"
            ? "animate-[drawerInRight_.24s_cubic-bezier(.2,.9,.25,1)]"
            : "animate-[drawerInLeft_.24s_cubic-bezier(.2,.9,.25,1)]"
        }`}
        style={{
          background: "var(--aur-drawer)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          boxShadow: side === "right"
            ? "-1px 0 0 var(--aur-hairline), -24px 0 60px -30px rgba(20,12,0,.5)"
            : "1px 0 0 var(--aur-hairline), 24px 0 60px -30px rgba(20,12,0,.5)",
        }}
      >
        <div className={`shrink-0 flex items-center justify-between mb-2 px-1 ${side === "right" ? "flex-row-reverse" : ""}`}>
          <b className="text-[13px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--tab-idle)" }}>
            Service
          </b>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className={`w-11 h-11 rounded-full grid place-items-center active:scale-[0.92] transition-transform ${side === "right" ? "-ml-1" : "-mr-1"}`}
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
          {/* The drawer answers "who came down". Expanded, it answers "which of
              them was a group, a VIP, not included" — the same rows with a
              search field and the lenses. */}
          <button
            onClick={pick(onExpandActivity)}
            data-role="drawer-expand-activity"
            aria-label="Ouvrir l'activité en grand"
            className="w-11 h-11 -mr-1 rounded-[12px] grid place-items-center active:scale-[0.92] transition-transform"
          >
            <ArrowsOutSimple size={17} weight="bold" style={{ color: "var(--brand-ink)" }} />
          </button>
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
            <ArrivalRow
              key={`${r.roomNumber}-${i}`}
              row={r}
              onOpen={pick(() => onPickRoom(r.roomNumber))}
              onUndo={onUndoRow}
            />
          ))}
        </div>

        {/* Preferences last, where a mis-tap costs nothing. */}
        {/* Preferences, as switches. Both are "do I want this", not "do this",
            so neither closes the drawer — watching it vanish would hide whether
            the flip took. */}
        {([
          { role: "drawer-preview", icon: <Cards size={19} weight="duotone" style={{ opacity: .75 }} />,
            label: "Aperçu au repos", on: idlePreview, act: onIdlePreviewToggle },
          { role: "drawer-swipe", icon: <HandSwipeRight size={19} weight="duotone" style={{ opacity: .75 }} />,
            label: "Balayage", on: swipe, act: onSwipeToggle },
        ] as const).map((s) => (
          <button
            key={s.role}
            onClick={s.act}
            data-role={s.role}
            role="switch"
            aria-checked={s.on}
            className="shrink-0 mt-2 min-h-[52px] px-4 rounded-[14px] flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            style={{ background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
          >
            {s.icon}
            <span className="flex-1 text-[14px] font-bold" style={{ color: "var(--aur-ink-2)" }}>{s.label}</span>
            <span
              aria-hidden
              className="shrink-0 w-[46px] h-[27px] rounded-full relative transition-colors"
              style={{ background: s.on ? "var(--aur-good)" : "rgba(128,128,128,.32)" }}
            >
              <i
                className="absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white transition-all"
                style={{ left: s.on ? 22 : 3, boxShadow: "0 1px 3px rgba(0,0,0,.28)" }}
              />
            </span>
          </button>
        ))}

        {/* Which build is this?
            "It does not work on my tablet" and "it works on mine" are the same
            sentence about two different builds, and we lost a round to that.
            Vercel stamps the commit into the bundle; showing seven characters
            of it turns a guess into a fact. */}
        <span
          data-role="build-stamp"
          className="shrink-0 mt-2 text-center text-[10px] font-bold tabular-nums tracking-[0.08em]"
          style={{ color: "var(--tab-idle)", opacity: 0.65 }}
        >
          build {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)}
        </span>

      </aside>

      <style jsx>{`
        @keyframes drawerInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @keyframes drawerInRight {
          from { transform: translateX(100%); }
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
