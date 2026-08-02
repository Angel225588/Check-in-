"use client";
import { sortNotes, type GuestNote } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";

/**
 * Notes inside the "Tout" tab.
 *
 * "Tout" means everything, and it was showing visits only — so the tab that
 * reads as the whole picture of a guest was the one place their allergy did
 * not appear. Someone scanning "Tout" and moving on would have missed it.
 *
 * Full-width chips rather than the compact rows in the Notes tab: at the width
 * this column now has, a note can afford to show its title AND what it
 * actually says, which is the difference between knowing a note exists and
 * knowing what to do.
 */
export default function SideNotesDigest({
  notes,
  onOpen,
}: {
  notes: GuestNote[];
  onOpen: () => void;
}) {
  const shown = sortNotes(notes);
  if (shown.length === 0) return null;

  return (
    <div className="shrink-0" data-role="side-notes-digest">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted font-medium">Notes</span>
        <button
          onClick={onOpen}
          className="text-[11px] font-black active:opacity-70"
          style={{ color: "var(--brand-ink)" }}
        >
          Tout voir
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {shown.map((n) => {
          const m = toneMeta(n.tone);
          const isAlert = n.tone === "alert";
          return (
            <button
              key={n.id}
              onClick={onOpen}
              data-role="digest-note"
              data-note-tone={n.tone}
              className="w-full text-left px-3 py-2.5 rounded-[14px] flex items-start gap-2.5 active:scale-[0.98] transition-transform"
              style={{
                background: m.soft,
                boxShadow: isAlert
                  ? `inset 0 0 0 1.5px ${m.color}`
                  : "inset 0 0 0 1px rgba(128,128,128,.14)",
              }}
            >
              <span className="mt-0.5 shrink-0">
                <NoteToneIcon tone={n.tone} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-extrabold leading-tight" style={{ color: m.color }}>
                  {n.title || m.label}
                </span>
                {n.body && n.body !== n.title && (
                  <span
                    className="block text-[12px] font-semibold leading-snug mt-0.5 line-clamp-2"
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
