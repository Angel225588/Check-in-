"use client";
import { useState } from "react";
import { ArrowLeft, ArrowsOut, ArrowsIn, PushPin, PencilSimple, Trash, CaretDown } from "@phosphor-icons/react/dist/ssr";
import type { GuestNote } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Opens inside the activity column so the check-in stays usable while someone
 * reads a note; ⤢ promotes it to a centred panel for long text. The measured
 * alternative — always centred — blocked the whole screen and put its close
 * button 1029px from the thumb on a landscape iPad.
 */
export default function NoteDetail({
  note,
  expanded,
  onToggleExpand,
  onBack,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  note: GuestNote;
  expanded: boolean;
  onToggleExpand: () => void;
  onBack: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const m = toneMeta(note.tone);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header. Delete lives up here, deliberately far from the thumb and
          visually quiet — the usability pass found it as the easiest control
          to hit by accident, on a screen where the accident erases an allergy. */}
      <div className="flex items-center gap-1.5 mb-3">
        <button onClick={onBack} aria-label="Retour aux notes" className="w-11 h-11 rounded-full grid place-items-center glass-liquid">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1" />
        <button onClick={onToggleExpand} aria-label={expanded ? "Réduire" : "Agrandir"} className="w-11 h-11 rounded-full grid place-items-center glass-liquid">
          {expanded ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer la note"
          data-role="note-delete"
          className="w-11 h-11 rounded-full grid place-items-center"
          style={{ color: "var(--tab-idle)" }}
        >
          <Trash size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-black mb-2.5"
          style={{ background: m.soft, color: m.color }}
        >
          <NoteToneIcon tone={note.tone} size={14} /> {m.label}
          {note.pinned && <PushPin weight="fill" size={12} />}
        </span>

        {note.title && (
          <h3 className="text-[19px] leading-tight font-black text-dark mb-1.5 break-words">{note.title}</h3>
        )}
        {note.body && (
          <p className="text-[14.5px] leading-relaxed text-dark/85 whitespace-pre-wrap break-words mb-3">{note.body}</p>
        )}

        <div className="text-[11.5px] mb-3" style={{ color: "var(--tab-idle)" }}>
          {note.author ? `${note.author} · ` : ""}{fmt(note.createdAt)}
        </div>

        {note.revisions.length > 0 && (
          <div className="rounded-[12px] overflow-hidden" style={{ background: "rgba(0,0,0,.035)" }}>
            <button
              onClick={() => setShowRevisions((v) => !v)}
              aria-expanded={showRevisions}
              className="w-full min-h-[44px] px-3 flex items-center justify-between text-[12px] font-extrabold"
              style={{ color: "var(--tab-idle)" }}
            >
              Activité ({note.revisions.length})
              <CaretDown size={13} style={{ transform: showRevisions ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
            </button>
            {showRevisions && (
              <div className="px-3 pb-2.5 flex flex-col gap-1.5">
                {[...note.revisions].reverse().map((r, i) => (
                  <div key={i} className="text-[11.5px] leading-snug" style={{ color: "var(--tab-idle)" }}>
                    <b className="text-dark/70">{r.author || "—"}</b> · {r.summary} · {fmt(r.at)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thumb zone — the safe, frequent actions. */}
      {confirmDelete ? (
        <div className="shrink-0 mt-3 rounded-[16px] p-3" style={{ background: "var(--aur-bad-soft)" }}>
          <div className="text-[13px] font-black mb-2.5" style={{ color: "var(--aur-bad-ink)" }}>
            Supprimer cette note définitivement ?
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 min-h-[44px] rounded-full glass-liquid text-[13px] font-bold">
              Annuler
            </button>
            <button
              onClick={onDelete}
              data-role="note-delete-confirm"
              className="flex-1 min-h-[44px] rounded-full text-white text-[13px] font-black"
              style={{ background: "var(--aur-bad)" }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 flex gap-2 mt-3">
          <button
            onClick={onTogglePin}
            aria-pressed={note.pinned}
            className="flex-1 min-h-[48px] rounded-full inline-flex items-center justify-center gap-1.5 text-[13px] font-extrabold"
            style={note.pinned
              ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
              : { background: "rgba(0,0,0,.05)", color: "var(--tab-idle)" }}
          >
            <PushPin weight={note.pinned ? "fill" : "duotone"} size={15} />
            {note.pinned ? "Épinglée" : "Épingler"}
          </button>
          <button
            onClick={onEdit}
            data-role="note-edit"
            className="flex-1 min-h-[48px] rounded-full inline-flex items-center justify-center gap-1.5 text-white text-[13px] font-black"
            style={{ background: "var(--color-brand)" }}
          >
            <PencilSimple weight="bold" size={15} /> Modifier
          </button>
        </div>
      )}
    </div>
  );
}
