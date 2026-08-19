"use client";
import { Clock, ChartBar, ArrowsHorizontal, Check } from "@phosphor-icons/react/dist/ssr";

/**
 * The four service controls, labelled.
 *
 * They used to be bare icons; a checkmark on its own for "close the day" is an
 * unlabelled, hard-to-undo action, and the first thing anyone asked about it
 * was what it did. Clôture is tinted apart from the two used constantly.
 */
export default function SearchNav({
  onRecents,
  onReport,
  onFlipSide,
  onCloseDay,
  handSide,
}: {
  onRecents: () => void;
  onReport: () => void;
  onFlipSide: () => void;
  onCloseDay: () => void;
  handSide: "left" | "right";
}) {
  const item =
    "flex-1 min-h-[60px] rounded-lg flex flex-col items-center justify-center gap-1 surface-chrome active:scale-[0.96] transition-transform";
  const label = "text-micro font-black uppercase tracking-[0.06em]";

  /* h-full, because this row shares a line with the metrics bar and the metrics
     bar is taller. Left at content height the buttons sat at the top of a
     stretched box and left a band of dead air between them and the preview card
     below — the gap Angel circled. Filling the line closes it and makes the
     targets bigger at the same time. */
  return (
    <div className="flex gap-2 h-full" data-role="search-nav">
      <button onClick={onRecents} className={item} title="Historique des check-ins">
        <Clock size={19} weight="duotone" style={{ opacity: .75 }} />
        <span className={label} style={{ color: "var(--tab-idle)" }}>Récents</span>
      </button>
      <button onClick={onReport} className={item} title="Rapport du service">
        <ChartBar size={19} weight="duotone" style={{ opacity: .75 }} />
        <span className={label} style={{ color: "var(--tab-idle)" }}>Rapport</span>
      </button>
      <button
        onClick={onFlipSide}
        data-role="hand-toggle"
        className={item}
        title="Passer les commandes à gauche ou à droite"
      >
        <ArrowsHorizontal size={19} weight="bold" style={{ opacity: .75 }} />
        <span className={label} style={{ color: "var(--tab-idle)" }}>
          {handSide === "left" ? "Gaucher" : "Droitier"}
        </span>
      </button>
      <button onClick={onCloseDay} className={item} title="Clôturer la journée">
        <Check size={19} weight="bold" style={{ opacity: .75, color: "var(--aur-bad-ink)" }} />
        <span className={label} style={{ color: "var(--aur-bad-ink)" }}>Clôture</span>
      </button>
    </div>
  );
}
