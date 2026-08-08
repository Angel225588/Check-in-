"use client";
import { useState } from "react";
import { ArrowUUpLeft, X } from "@phosphor-icons/react/dist/ssr";
import type { RecentEntry } from "@/components/PreviewPanes";

/**
 * One arrival, openable and correctable where it is listed.
 *
 * Correcting a mis-tap used to mean a button in the drawer that opened a
 * screen whose only job was undo — a trip to fix a typo you are already
 * looking at. The row does it now, and the drawer's button is gone.
 *
 * Two steps, not a modal. Undo destroys a record and a modal mid-service is
 * one more thing to dismiss, so the row arms itself: the first tap shows
 * "Annuler ?" with a way out, the second removes it. A mis-tap costs one more
 * tap, which is the right price for something that cannot be un-done.
 *
 * Not a button inside a button: the row is a div with two of them, because the
 * nesting is invalid HTML and Safari resolves it by dropping one.
 */
export default function ArrivalRow({
  row,
  onOpen,
  onUndo,
  size = "compact",
  children,
}: {
  row: RecentEntry;
  onOpen: () => void;
  onUndo?: (id: string) => void;
  /** "compact" in the drawer, "roomy" in the full-screen sheet. */
  size?: "compact" | "roomy";
  /** Anything extra under the name — the sheet shows the package code. */
  children?: React.ReactNode;
}) {
  const [arming, setArming] = useState(false);
  const roomy = size === "roomy";
  const canUndo = !!onUndo && !!row.id;

  return (
    <div
      data-role={roomy ? "activity-row" : "drawer-recent-row"}
      data-arming={arming ? "yes" : "no"}
      className={`w-full rounded-[${roomy ? "16px" : "12px"}] flex items-center transition-colors ${
        roomy ? "min-h-[64px] surface-inset" : "min-h-[52px]"
      }`}
      style={
        arming
          ? { background: "var(--aur-bad-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-bad)" }
          : roomy
            ? undefined
            : { background: "rgba(128,128,128,.08)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }
      }
    >
      {arming ? (
        <>
          <span className="flex-1 min-w-0 pl-4 text-[13px] font-black" style={{ color: "var(--aur-bad-ink)" }}>
            Annuler l&apos;entrée de {row.roomNumber} ?
          </span>
          <button
            type="button"
            data-role="arrival-undo-confirm"
            onClick={() => { if (row.id) onUndo?.(row.id); setArming(false); }}
            className="shrink-0 min-h-[44px] px-3.5 rounded-[10px] text-[13px] font-black active:scale-[0.96] transition-transform"
            style={{ background: "var(--aur-bad)", color: "#fff" }}
          >
            Annuler
          </button>
          <button
            type="button"
            aria-label="Garder"
            data-role="arrival-undo-cancel"
            onClick={() => setArming(false)}
            className="shrink-0 w-11 h-11 grid place-items-center active:scale-[0.92] transition-transform"
          >
            <X size={15} weight="bold" style={{ color: "var(--aur-bad-ink)" }} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            data-role="arrival-open"
            className={`flex-1 min-w-0 text-left flex items-center self-stretch rounded-l-[${roomy ? "16px" : "12px"}] transition-transform active:scale-[0.985] ${
              roomy ? "gap-3.5 pl-4" : "gap-3 pl-3"
            }`}
          >
            <em
              className={`not-italic font-bold tabular-nums shrink-0 ${roomy ? "text-[13px] w-[44px]" : "text-[12px]"}`}
              style={{ color: "var(--tab-idle)" }}
            >
              {row.at}
            </em>
            <b
              className={`font-black tabular-nums shrink-0 ${roomy ? "text-[21px]" : "text-[17px]"}`}
              style={{ color: "var(--brand-ink)" }}
            >
              {row.roomNumber}
            </b>
            <span className="flex-1 min-w-0">
              <span
                className={`block truncate font-bold ${roomy ? "text-[15px]" : "text-[13px]"}`}
                style={{ color: "var(--aur-ink-2)" }}
              >
                {row.name}
              </span>
              {children}
            </span>
          </button>

          <span
            className={`shrink-0 rounded-full grid place-items-center font-black tabular-nums ${
              roomy ? "w-8 h-8 text-[13px]" : "w-7 h-7 text-[12px]"
            }`}
            style={{ background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }}
          >
            {row.pax}
          </span>

          {canUndo && (
            <button
              type="button"
              data-role="arrival-undo"
              aria-label={`Corriger l'entrée de la chambre ${row.roomNumber}`}
              onClick={() => setArming(true)}
              className="shrink-0 w-11 h-11 mr-0.5 grid place-items-center rounded-[10px] active:scale-[0.9] transition-transform"
            >
              <ArrowUUpLeft size={16} weight="bold" style={{ color: "var(--tab-idle)" }} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
