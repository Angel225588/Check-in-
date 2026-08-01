"use client";
import { pinnedStrip, type GuestNote } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";

/**
 * "À retenir pour ce client" — the notes, on the check-in card itself, so an
 * allergy is visible without opening anything.
 *
 * Two lines per chip: the title in the tone's colour, the note under it. A
 * one-line chip reading "Fried eggs proposition Wann…" told you a note existed
 * and nothing about what it said, which is the one thing that matters when
 * someone is standing in front of you.
 *
 * The row scrolls sideways and carries every note rather than three plus a
 * "+2". A cap needs the receptionist to notice a counter and decide to open a
 * panel; a scroller only needs a thumb. Alerts sort first either way, so the
 * one that must not be missed is the one already on screen.
 */
export default function PinnedNoteChips({
  notes,
  onOpen,
}: {
  notes: GuestNote[];
  onOpen: (id: string) => void;
  /** Kept for callers that still pass it; the row no longer overflows. */
  onOpenAll?: () => void;
}) {
  const shown = pinnedStrip(notes);
  if (shown.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: "var(--tab-idle)" }}>
          À retenir pour ce client
        </span>
        {shown.length > 2 && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: "var(--tab-idle)" }}>
            {shown.length} notes
          </span>
        )}
      </div>

      <div
        className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1"
        data-role="pinned-strip"
        style={{ touchAction: "pan-x", overscrollBehavior: "contain" }}
      >
        {shown.map((n) => {
          const m = toneMeta(n.tone);
          const isAlert = n.tone === "alert";
          return (
            <button
              key={n.id}
              onClick={() => onOpen(n.id)}
              data-role="pinned-chip"
              data-note-tone={n.tone}
              className="shrink-0 w-[228px] min-h-[60px] text-left px-3 py-2 rounded-[14px] flex items-start gap-2 active:scale-[0.97] transition-transform"
              style={{
                background: m.soft,
                // An alert gets a ring; the others get their tint and nothing
                // else, so one thing on the card is loud at a time.
                boxShadow: isAlert
                  ? `inset 0 0 0 1.5px ${m.color}`
                  : `inset 0 0 0 1px rgba(128,128,128,.14)`,
              }}
            >
              <span className="mt-0.5 shrink-0">
                <NoteToneIcon tone={n.tone} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-extrabold leading-tight truncate"
                  style={{ color: m.color }}
                >
                  {n.title || m.label}
                </span>
                {n.body && n.body !== n.title && (
                  <span
                    className="block text-[11.5px] font-semibold leading-snug line-clamp-2"
                    style={{ color: "var(--aur-ink-2)" }}
                  >
                    {n.body}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
