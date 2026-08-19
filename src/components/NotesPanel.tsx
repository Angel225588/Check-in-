"use client";
import { useState, useMemo, useEffect } from "react";
import { Plus, PushPin, WarningCircle, ArrowsOut, Check, X } from "@phosphor-icons/react/dist/ssr";
import { filterNotes, TONES, MAX_TITLE, MAX_BODY, shouldPinByDefault, type GuestNote, type NoteTone } from "@/lib/notes";
import { toneMeta, toneChipStyle } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";
import NoteDetail from "./NoteDetail";
import type { NotesApi } from "@/hooks/useGuestNotes";

export interface NoteDraft {
  tone: NoteTone;
  title: string;
  body: string;
  pinned: boolean;
  editingId: string | null;
}

export interface NotesExpandRequest {
  view: "list" | "detail" | "compose";
  noteId?: string;
  draft?: NoteDraft;
}

/**
 * The Notes tab, in the activity column.
 *
 * Opening the tab shows what is already there — a list you can scan — rather
 * than assuming you came to write. Reading a note opens it here too; ⤢ promotes
 * whatever you are doing to the centred panel, which is the right place for a
 * long note or a long paragraph but the wrong place to land by default.
 *
 * It renders for EVERY guest, including a first visit. The previous version
 * mounted the tab row only when a guest had prior stays, so a first-time guest
 * had no path to their own notes — an allergy recorded at booking was
 * unreachable from the one screen that decides whether they eat.
 */
export default function NotesPanel({
  api,
  onExpand,
  composeSignal = 0,
}: {
  api: NotesApi;
  onExpand: (req: NotesExpandRequest) => void;
  /** Bumped by the panel header's ✎ so a note can be started from any tab,
   *  not only after scrolling to the button at the bottom of the notes list. */
  composeSignal?: number;
}) {
  const [tone, setTone] = useState<NoteTone | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [pinTouched, setPinTouched] = useState(false);

  useEffect(() => {
    if (composeSignal > 0) {
      setPinTouched(false);
      setDraft({ tone: "info", title: "", body: "", pinned: false, editingId: null });
    }
  }, [composeSignal]);

  const visible = useMemo(() => filterNotes(api.notes, tone), [api.notes, tone]);
  const selected = api.notes.find((n) => n.id === selectedId) ?? null;

  const startNew = () => {
    setPinTouched(false);
    setDraft({ tone: "info", title: "", body: "", pinned: false, editingId: null });
  };
  const startEdit = (n: GuestNote) => {
    setPinTouched(true);
    setDraft({ tone: n.tone, title: n.title, body: n.body, pinned: n.pinned, editingId: n.id });
  };
  const pickTone = (t: NoteTone) => {
    setDraft((d) => (d ? { ...d, tone: t, pinned: pinTouched ? d.pinned : shouldPinByDefault(t) } : d));
  };
  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() && !draft.body.trim()) return;
    const payload = { tone: draft.tone, title: draft.title.trim(), body: draft.body.trim(), pinned: draft.pinned };
    if (draft.editingId) await api.edit(draft.editingId, payload);
    else await api.add(payload);
    setDraft(null);
    setSelectedId(null);
  };

  /** Hand the current work to the centred panel and let go of it here, so the
   *  same draft is never live in two places at once. */
  const expand = (req: NotesExpandRequest) => {
    setDraft(null);
    setSelectedId(null);
    onExpand(req);
  };

  const expandBtn = (req: NotesExpandRequest, label: string) => (
    <button
      onClick={() => expand(req)}
      data-role="notes-expand"
      aria-label={label}
      title={label}
      className="w-11 h-11 shrink-0 rounded-full grid place-items-center glass-liquid active:scale-[0.94] transition-transform"
    >
      <ArrowsOut size={15} weight="bold" style={{ color: "var(--tab-idle)" }} />
    </button>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {api.saveError && (
        <div className="shrink-0 mb-2 flex items-start gap-2 rounded-md px-3 py-2" style={{ background: "var(--aur-bad-soft)" }}>
          <WarningCircle weight="duotone" size={16} color="var(--aur-bad-ink)" className="shrink-0 mt-0.5" />
          <div className="text-xs font-bold leading-snug" style={{ color: "var(--aur-bad-ink)" }}>
            Note NON enregistrée — stockage plein.
            <button onClick={api.clearError} className="underline ml-1 font-black">Fermer</button>
          </div>
        </div>
      )}

      {/* ── Compose / edit, in place ───────────────────────────────── */}
      {draft && (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs font-black flex-1" style={{ color: "var(--brand-ink)" }}>
              {draft.editingId ? "Modifier" : "Nouvelle note"}
            </span>
            {expandBtn({ view: "compose", draft }, "Agrandir au centre")}
            <button
              onClick={() => setDraft(null)}
              aria-label="Annuler"
              className="w-11 h-11 shrink-0 rounded-full grid place-items-center glass-liquid active:scale-[0.94] transition-transform"
            >
              <X size={15} weight="bold" style={{ color: "var(--tab-idle)" }} />
            </button>
          </div>

          <div className="shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {TONES.map((t) => {
              const m = toneMeta(t);
              const on = draft.tone === t;
              return (
                <button
                  key={t}
                  onClick={() => pickTone(t)}
                  data-role="note-tone"
                  aria-pressed={on}
                  className="shrink-0 inline-flex items-center gap-1 min-h-[44px] px-2 rounded-full text-xs font-extrabold transition-all"
                  style={toneChipStyle(t, on)}
                >
                  <NoteToneIcon tone={t} size={12} color={on ? m.color : "var(--tab-idle)"} />
                  {m.label}
                </button>
              );
            })}
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value.slice(0, MAX_TITLE) })}
            data-role="note-title"
            placeholder="Titre"
            aria-label="Titre de la note"
            autoComplete="off"
            className="shrink-0 min-h-[52px] px-3 rounded-card bg-black/[0.04] dark:bg-white/[0.06] outline-none text-base font-extrabold text-dark"
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value.slice(0, MAX_BODY) })}
            data-role="note-body"
            placeholder="Détail…"
            aria-label="Contenu de la note"
            className="flex-1 min-h-[140px] p-3 rounded-card bg-black/[0.04] dark:bg-white/[0.06] outline-none text-sm leading-relaxed text-dark resize-none"
          />

          <button
            onClick={() => { setPinTouched(true); setDraft({ ...draft, pinned: !draft.pinned }); }}
            aria-pressed={draft.pinned}
            className="shrink-0 min-h-[44px] rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-extrabold"
            style={draft.pinned
              ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
              : { background: "rgba(128,128,128,.10)", color: "var(--tab-idle)" }}
          >
            <PushPin weight={draft.pinned ? "fill" : "duotone"} size={14} />
            {draft.pinned ? "Épinglée" : "Épingler"}
          </button>

          <button
            onClick={save}
            data-role="note-save"
            className="shrink-0 min-h-[52px] rounded-full inline-flex items-center justify-center gap-2 text-white text-sm font-black active:scale-[0.97] transition-transform"
            style={{ background: "var(--aur-good)", boxShadow: "0 8px 22px -10px rgba(47,111,79,.6)" }}
          >
            <Check weight="bold" size={17} /> Enregistrer
          </button>
        </div>
      )}

      {/* ── One note, read in place ────────────────────────────────── */}
      {!draft && selected && (
        <div className="flex-1 min-h-0">
          <NoteDetail
            note={selected}
            expanded={false}
            onToggleExpand={() => expand({ view: "detail", noteId: selected.id })}
            onBack={() => setSelectedId(null)}
            onEdit={() => startEdit(selected)}
            onTogglePin={() => api.pin(selected.id)}
            onDelete={async () => { await api.remove(selected.id); setSelectedId(null); }}
          />
        </div>
      )}

      {/* ── The list, which is what opening the tab should show ────── */}
      {!draft && !selected && (
        <>
          <div className="shrink-0 flex items-center gap-1.5 mb-1.5">
            <span className="text-micro uppercase tracking-wide flex-1" style={{ color: "var(--tab-idle)" }}>
              {api.notes.length} note{api.notes.length > 1 ? "s" : ""}
            </span>
            {expandBtn({ view: "list" }, "Agrandir au centre")}
          </div>

          <div className="shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {(["all", ...TONES] as const).map((t) => {
              const on = tone === t;
              const m = t === "all" ? null : toneMeta(t as NoteTone);
              return (
                <button
                  key={t}
                  onClick={() => setTone(t as NoteTone | "all")}
                  aria-pressed={on}
                  className="shrink-0 inline-flex items-center gap-1 min-h-[44px] px-3 rounded-full text-xs font-extrabold transition-all"
                  style={toneChipStyle(t as NoteTone | "all", on)}
                >
                  {m && <NoteToneIcon tone={t as NoteTone} size={13} color={on ? m.color : "var(--tab-idle)"} />}
                  {m ? m.label : "Tout"}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
            {!api.ready && <div className="text-xs text-center py-6" style={{ color: "var(--tab-idle)" }}>Déchiffrement…</div>}
            {api.ready && visible.length === 0 && (
              <div className="text-xs text-center py-6 leading-relaxed" style={{ color: "var(--tab-idle)" }}>
                Aucune note{tone !== "all" ? " de ce type" : ""}.<br />
                Ajoutez une allergie, une préférence, un événement.
              </div>
            )}
            {visible.map((n) => (
              <NoteRow key={n.id} note={n} onOpen={() => setSelectedId(n.id)} />
            ))}
          </div>

          <button
            onClick={startNew}
            data-role="note-new"
            className="shrink-0 mt-2 min-h-[48px] rounded-full inline-flex items-center justify-center gap-1.5 text-white text-sm font-black active:scale-[0.97] transition-all"
            style={{ background: "var(--color-brand)", boxShadow: "0 8px 22px -10px rgba(166,105,20,.6)" }}
          >
            <Plus weight="bold" size={16} /> Ajouter une note
          </button>
        </>
      )}
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
      data-role="note-row"
      data-note-tone={note.tone}
      className="shrink-0 w-full text-left rounded-card pl-3 pr-3 py-2 flex items-start gap-2 min-h-[56px] active:scale-[0.99] transition-transform relative overflow-hidden"
      style={{ background: isAlert ? m.soft : "rgba(0,0,0,.035)" }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3.5px]" style={{ background: m.color }} />
      <NoteToneIcon tone={note.tone} size={16} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold leading-snug truncate" style={{ color: isAlert ? m.color : undefined }}>
          {note.title || note.body.slice(0, 60)}
        </span>
        {note.title && note.body && (
          <span className="block text-xs truncate mt-0.5" style={{ color: "var(--tab-idle)" }}>{note.body}</span>
        )}
      </span>
      {note.pinned && <PushPin weight="fill" size={12} className="shrink-0 mt-0.5" style={{ color: m.color }} />}
    </button>
  );
}
