"use client";
import { useState, useMemo } from "react";
import { Plus, PushPin, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { filterNotes, TONES, type GuestNote, type NoteTone } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";
import NoteComposer, { type ComposerResult } from "./NoteComposer";
import NoteDetail from "./NoteDetail";
import type { NotesApi } from "@/hooks/useGuestNotes";

/**
 * The Notes tab. Renders for EVERY guest — including a first visit.
 *
 * That is the whole point of this build: the previous version only mounted the
 * tab row when a guest had prior stays, so a first-time guest had no path to
 * their own notes at all. For a guest with a severe allergy the note was
 * unreachable from the screen where it mattered.
 */
export default function NotesPanel({ api }: { api: NotesApi }) {
  const [tone, setTone] = useState<NoteTone | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => filterNotes(api.notes, tone), [api.notes, tone]);
  const selected = api.notes.find((n) => n.id === selectedId) ?? null;
  const editing = api.notes.find((n) => n.id === editingId) ?? null;

  const save = async (r: ComposerResult) => {
    if (editing) await api.edit(editing.id, r);
    else await api.add(r);
    setComposing(false);
    setEditingId(null);
  };

  const detail = selected && (
    <NoteDetail
      note={selected}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      onBack={() => { setSelectedId(null); setExpanded(false); }}
      onEdit={() => { setEditingId(selected.id); setComposing(true); }}
      onTogglePin={() => api.pin(selected.id)}
      onDelete={async () => { await api.remove(selected.id); setSelectedId(null); setExpanded(false); }}
    />
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {api.saveError && (
        <div className="shrink-0 mb-2 flex items-start gap-2 rounded-[12px] px-3 py-2.5" style={{ background: "var(--aur-bad-soft)" }}>
          <WarningCircle weight="duotone" size={16} color="var(--aur-bad)" className="shrink-0 mt-0.5" />
          <div className="text-[12px] font-bold leading-snug" style={{ color: "var(--aur-bad)" }}>
            Note NON enregistrée — stockage plein.
            <button onClick={api.clearError} className="underline ml-1 font-black">Fermer</button>
          </div>
        </div>
      )}

      {/* Detail replaces the list in place; ⤢ promotes it to a centred panel. */}
      {selected && !expanded && <div className="flex-1 min-h-0">{detail}</div>}
      {selected && expanded && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md" onClick={() => setExpanded(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[560px] max-h-[86vh] rounded-[24px] p-5 flex flex-col"
            style={{ background: "var(--color-card,#fff)", boxShadow: "0 28px 70px -20px rgba(60,40,10,.45)" }}>
            {detail}
          </div>
        </div>
      )}

      {!selected && (
        <>
          {/* Tone filter */}
          <div className="shrink-0 flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {(["all", ...TONES] as const).map((t) => {
              const on = tone === t;
              const m = t === "all" ? null : toneMeta(t as NoteTone);
              return (
                <button
                  key={t}
                  onClick={() => setTone(t as NoteTone | "all")}
                  aria-pressed={on}
                  className="shrink-0 inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full text-[12px] font-extrabold transition-all"
                  style={on
                    ? { background: m ? m.soft : "rgba(0,0,0,.07)", color: m ? m.color : "#1C1C1C", boxShadow: `inset 0 0 0 1.5px ${m ? m.color : "rgba(0,0,0,.25)"}` }
                    : { background: "rgba(0,0,0,.04)", color: "var(--tab-idle)" }}
                >
                  {m && <NoteToneIcon tone={t as NoteTone} size={13} color={on ? m.color : "var(--tab-idle)"} />}
                  {m ? m.label : "Tout"}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
            {!api.ready && <div className="text-[12.5px] text-center py-6" style={{ color: "var(--tab-idle)" }}>Déchiffrement…</div>}
            {api.ready && visible.length === 0 && (
              <div className="text-[12.5px] text-center py-6 leading-relaxed" style={{ color: "var(--tab-idle)" }}>
                Aucune note{tone !== "all" ? " de ce type" : ""}.<br />
                Ajoutez une allergie, une préférence, un événement.
              </div>
            )}
            {visible.map((n) => (
              <NoteRow key={n.id} note={n} onOpen={() => setSelectedId(n.id)} />
            ))}
          </div>

          <button
            onClick={() => { setEditingId(null); setComposing(true); }}
            className="shrink-0 mt-2 min-h-[48px] rounded-full inline-flex items-center justify-center gap-1.5 text-white text-[14px] font-black active:scale-[0.97] transition-all"
            style={{ background: "var(--color-brand)", boxShadow: "0 8px 22px -10px rgba(166,105,20,.6)" }}
          >
            <Plus weight="bold" size={16} /> Ajouter une note
          </button>
        </>
      )}

      <NoteComposer
        open={composing}
        existing={editing}
        onSave={save}
        onCancel={() => { setComposing(false); setEditingId(null); }}
      />
    </div>
  );
}

/**
 * A row carries its tone as a full-height colour rail plus a tinted ground.
 * The earlier version distinguished an allergy from a room preference with a
 * 12px dot, and testers read the two as the same card.
 */
function NoteRow({ note, onOpen }: { note: GuestNote; onOpen: () => void }) {
  const m = toneMeta(note.tone);
  const isAlert = note.tone === "alert";
  return (
    <button
      onClick={onOpen}
      data-note-tone={note.tone}
      className="shrink-0 w-full text-left rounded-[14px] pl-3 pr-3 py-2.5 flex items-start gap-2.5 min-h-[56px] active:scale-[0.99] transition-transform relative overflow-hidden"
      style={{ background: isAlert ? m.soft : "rgba(0,0,0,.035)" }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3.5px]" style={{ background: m.color }} />
      <NoteToneIcon tone={note.tone} size={16} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold leading-snug truncate" style={{ color: isAlert ? m.color : undefined }}>
          {note.title || note.body.slice(0, 60)}
        </span>
        {note.title && note.body && (
          <span className="block text-[11.5px] truncate mt-0.5" style={{ color: "var(--tab-idle)" }}>{note.body}</span>
        )}
      </span>
      {note.pinned && <PushPin weight="fill" size={12} className="shrink-0 mt-0.5" style={{ color: m.color }} />}
    </button>
  );
}
