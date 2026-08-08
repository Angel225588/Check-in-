"use client";
import { useState } from "react";
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
 *
 * And it opens where it is. Tapping used to jump to the Notes tab, which is a
 * change of screen to read two more lines of something already in front of
 * you. The chip expands instead; "Tout voir" is still there for the tab.
 */
export default function SideNotesDigest({
  notes,
  onOpen,
}: {
  notes: GuestNote[];
  onOpen: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
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
              onClick={() => setOpenId(openId === n.id ? null : n.id)}
              aria-expanded={openId === n.id}
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
                    data-role="digest-note-body"
                    className={`block text-[12px] font-semibold leading-snug mt-0.5 ${
                      openId === n.id ? "" : "line-clamp-2"
                    }`}
                    style={{ color: "var(--aur-ink-2)" }}
                  >
                    {n.body}
                  </span>
                )}
                {openId === n.id && (
                  <span className="block text-[10.5px] font-bold mt-1.5" style={{ color: "var(--tab-idle)" }}>
                    {n.author} · {new Date(n.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
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
