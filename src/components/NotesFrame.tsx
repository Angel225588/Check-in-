"use client";
import { useState } from "react";
import { NotePencil, CaretLeft, PushPin, Trash, Check, Plus } from "@phosphor-icons/react/dist/ssr";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";
import { TONES, type GuestNote, type NoteTone } from "@/lib/notes";

export interface NoteDraft {
  tone: NoteTone;
  text: string;
  /** Set when editing an existing note rather than starting one. */
  editing?: string;
}

/**
 * US-17 / US-18 — the notes face, as a watch face rather than a door.
 *
 * Reading a one-line note used to cost a full-screen panel over the queue. The
 * frame does it now: list, read, write, all in the same box, and the box never
 * changes size — the pad below it does not move while someone is standing
 * there.
 *
 * Typing goes through the pad that is already on screen. That is the whole
 * reason this fits: a note editor needs a keyboard, the app owns the keyboard,
 * and it is six inches below the frame already. The parent routes its keys to
 * `draft` while one is open.
 *
 * One field, not two (US-18). Reception is writing "pas de fruits à coque" at
 * 07:40, and asking which half of that is the title is asking them to file
 * rather than to write.
 */
export default function NotesFrame({
  notes,
  ready,
  draft,
  onDraftChange,
  onSave,
  onDelete,
  onPin,
  saveError,
}: {
  notes: GuestNote[];
  ready: boolean;
  draft: NoteDraft | null;
  onDraftChange: (d: NoteDraft | null) => void;
  onSave: (d: NoteDraft) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  saveError?: boolean;
}) {
  const [reading, setReading] = useState<string | null>(null);
  const open = notes.find((n) => n.id === reading) ?? null;

  const shell =
    "flex-1 min-h-[150px] rounded-xl px-4 pt-3 pb-7 flex flex-col overflow-hidden surface-card";
  const cap = "text-micro font-black uppercase tracking-[0.14em] shrink-0";

  /* ── Writing ─────────────────────────────────────────────────────────── */
  if (draft) {
    const m = toneMeta(draft.tone);
    return (
      <div className={shell} data-role="pane-notes" data-view="compose">
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => onDraftChange(null)}
            aria-label="Abandonner"
            data-role="note-cancel"
            className="w-9 h-9 -ml-1.5 grid place-items-center rounded-full active:scale-[0.92] transition-transform"
          >
            <CaretLeft size={16} weight="bold" style={{ color: "var(--tab-idle)" }} />
          </button>
          <span className={cap} style={{ color: "var(--tab-idle)" }}>
            {draft.editing ? "Modifier" : "Nouvelle note"}
          </span>
          <span className="flex-1" />
          <button
            onClick={() => draft.text.trim() && onSave(draft)}
            disabled={!draft.text.trim()}
            data-role="note-save"
            className="min-h-[36px] px-3.5 rounded-full text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-35 active:scale-[0.96] transition-transform"
            style={{ background: "var(--aur-good)", color: "#fff" }}
          >
            <Check size={14} weight="bold" /> Enregistrer
          </button>
        </div>

        {/* The tone first: it decides whether this note shouts on the card. */}
        <div className="shrink-0 flex gap-1.5 mt-2 overflow-x-auto no-scrollbar" data-role="note-tones">
          {TONES.map((t) => {
            const on = draft.tone === t;
            const tm = toneMeta(t);
            return (
              <button
                key={t}
                onClick={() => onDraftChange({ ...draft, tone: t })}
                aria-pressed={on}
                data-role="note-tone"
                data-tone={t}
                className="shrink-0 min-h-[36px] px-2.5 rounded-full inline-flex items-center gap-1.5 text-xs font-black transition-transform active:scale-[0.96]"
                style={on
                  ? { background: tm.soft, color: tm.color, boxShadow: `inset 0 0 0 1.5px ${tm.color}` }
                  : { background: "rgba(128,128,128,.09)", color: "var(--tab-idle)" }}
              >
                <NoteToneIcon tone={t} size={13} color={on ? tm.color : "var(--tab-idle)"} />
                {tm.label}
              </button>
            );
          })}
        </div>

        {/* One field. The pad below is typing into it. */}
        <div
          className="flex-1 min-h-0 mt-2 rounded-card px-3 py-2 overflow-y-auto surface-field"
          data-role="note-field"
        >
          <span className="text-base font-bold leading-snug break-words" style={{ color: "var(--aur-ink-2)" }}>
            {draft.text || (
              <em className="not-italic font-semibold" style={{ color: "var(--tab-idle)" }}>
                Tapez la note…
              </em>
            )}
            <i className="inline-block w-[2px] h-[1.05em] align-[-0.15em] ml-[1px] animate-[blink_1.1s_steps(1)_infinite]"
              style={{ background: m.color }} />
          </span>
        </div>
        {saveError && (
          <span className="shrink-0 mt-1 text-xs font-black" style={{ color: "var(--aur-bad-ink)" }}>
            NON enregistrée — stockage plein.
          </span>
        )}
        <style jsx>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
      </div>
    );
  }

  /* ── Reading ─────────────────────────────────────────────────────────── */
  if (open) {
    const m = toneMeta(open.tone);
    return (
      <div className={shell} data-role="pane-notes" data-view="read">
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => setReading(null)}
            aria-label="Retour aux notes"
            data-role="note-back"
            className="w-9 h-9 -ml-1.5 grid place-items-center rounded-full active:scale-[0.92] transition-transform"
          >
            <CaretLeft size={16} weight="bold" style={{ color: "var(--tab-idle)" }} />
          </button>
          <NoteToneIcon tone={open.tone} size={15} />
          <span className={cap} style={{ color: m.color }}>{m.label}</span>
          <span className="flex-1" />
          <button onClick={() => onPin(open.id)} aria-label={open.pinned ? "Détacher" : "Épingler"}
            data-role="note-pin" className="w-9 h-9 grid place-items-center active:scale-[0.9] transition-transform">
            <PushPin size={15} weight={open.pinned ? "fill" : "regular"}
              style={{ color: open.pinned ? "var(--brand-ink)" : "var(--tab-idle)" }} />
          </button>
          <button
            onClick={() => onDraftChange({ tone: open.tone, text: open.title || open.body, editing: open.id })}
            aria-label="Modifier" data-role="note-edit"
            className="w-9 h-9 grid place-items-center active:scale-[0.9] transition-transform"
          >
            <NotePencil size={15} weight="duotone" style={{ color: "var(--brand-ink)" }} />
          </button>
          <button onClick={() => { onDelete(open.id); setReading(null); }} aria-label="Supprimer"
            data-role="note-delete" className="w-9 h-9 -mr-1 grid place-items-center active:scale-[0.9] transition-transform">
            <Trash size={15} weight="bold" style={{ color: "var(--aur-bad-ink)" }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2" style={{ overscrollBehavior: "contain" }}>
          <p className="text-base font-bold leading-snug break-words" style={{ color: "var(--aur-ink-2)" }}>
            {open.title}
          </p>
          {open.body && (
            <p className="text-sm leading-snug break-words mt-1.5" style={{ color: "var(--tab-idle)" }}>
              {open.body}
            </p>
          )}
          <p className="text-xs font-bold mt-2" style={{ color: "var(--tab-idle)" }}>
            {open.author} · {new Date(open.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          </p>
        </div>
      </div>
    );
  }

  /* ── The list ────────────────────────────────────────────────────────── */
  return (
    <div className={shell} data-role="pane-notes" data-view="list">
      <div className="shrink-0 flex items-center gap-2">
        <span className={cap} style={{ color: "var(--tab-idle)" }}>
          <NotePencil weight="duotone" size={13} className="inline mr-1.5 -mt-0.5" />
          Notes{notes.length ? ` · ${notes.length}` : ""}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => onDraftChange({ tone: "info", text: "" })}
          data-role="note-new"
          aria-label="Nouvelle note"
          className="w-9 h-9 -mr-1 rounded-md grid place-items-center active:scale-[0.9] transition-transform"
          style={{ background: "var(--aur-gold-soft-2)" }}
        >
          <Plus size={15} weight="bold" style={{ color: "var(--brand-ink)" }} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 mt-2"
        style={{ overscrollBehavior: "contain" }}>
        {!ready && (
          <span className="text-sm font-semibold" style={{ color: "var(--tab-idle)" }}>Déchiffrement…</span>
        )}
        {ready && notes.length === 0 && (
          <span className="text-sm font-semibold" style={{ color: "var(--tab-idle)" }}>
            Aucune note pour ce client.
          </span>
        )}
        {notes.map((n) => {
          const m = toneMeta(n.tone);
          return (
            <button
              key={n.id}
              type="button"
              data-role="note-row"
              onClick={() => setReading(n.id)}
              className="w-full text-left shrink-0 min-h-[44px] rounded-md px-2.5 py-2 flex items-start gap-2 relative overflow-hidden transition-transform active:scale-[0.985]"
              style={{ background: n.tone === "alert" ? m.soft : "rgba(128,128,128,.07)" }}
            >
              <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: m.color }} />
              <NoteToneIcon tone={n.tone} size={14} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold leading-snug truncate"
                  style={{ color: n.tone === "alert" ? m.color : undefined }}>
                  {n.title || n.body}
                </span>
                {n.title && n.body && (
                  <span className="block text-xs truncate" style={{ color: "var(--tab-idle)" }}>{n.body}</span>
                )}
              </span>
              {n.pinned && <PushPin size={12} weight="fill" style={{ color: "var(--brand-ink)" }} className="shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
