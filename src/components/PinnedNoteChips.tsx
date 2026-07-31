"use client";
import { pinnedChips, type GuestNote } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";

/**
 * "À retenir pour ce client" — the pinned notes, surfaced on the check-in card
 * itself so an allergy is visible without opening anything.
 *
 * Capped at three by `pinnedChips`, with the remainder counted out loud. The
 * mockup's scrolling row left a fourth chip clipped at 75% behind a gesture
 * nobody discovers, which reads as "there is nothing more here".
 *
 * Alerts sort first, so the cap can never be what hides an allergy.
 */
export default function PinnedNoteChips({
  notes,
  onOpen,
  onOpenAll,
}: {
  notes: GuestNote[];
  onOpen: (id: string) => void;
  onOpenAll: () => void;
}) {
  const { shown, overflow } = pinnedChips(notes);
  if (shown.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1.5 font-bold" style={{ color: "var(--tab-idle)" }}>
        À retenir pour ce client
      </div>
      <div className="flex flex-wrap gap-2">
        {shown.map((n) => {
          const m = toneMeta(n.tone);
          const isAlert = n.tone === "alert";
          return (
            <button
              key={n.id}
              onClick={() => onOpen(n.id)}
              data-role="pinned-chip"
              data-note-tone={n.tone}
              className="inline-flex items-center gap-1.5 min-h-[44px] max-w-full px-3 rounded-full text-[13px] font-extrabold active:scale-[0.97] transition-transform"
              style={{
                background: m.soft,
                color: m.color,
                boxShadow: isAlert ? `inset 0 0 0 1.5px ${m.color}` : "var(--shadow-warm-1)",
              }}
            >
              <NoteToneIcon tone={n.tone} size={15} />
              <span className="truncate max-w-[190px]">{n.title || n.body.slice(0, 40)}</span>
            </button>
          );
        })}
        {overflow > 0 && (
          <button
            onClick={onOpenAll}
            data-role="pinned-overflow"
            className="inline-flex items-center min-h-[44px] px-3 rounded-full text-[13px] font-extrabold"
            style={{ background: "rgba(0,0,0,.05)", color: "var(--tab-idle)" }}
          >
            +{overflow}
          </button>
        )}
      </div>
    </div>
  );
}
