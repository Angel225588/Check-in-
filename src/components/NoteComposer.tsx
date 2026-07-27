"use client";
import { useState, useEffect, useRef } from "react";
import { PushPin, X, Check } from "@phosphor-icons/react/dist/ssr";
import { TONES, MAX_TITLE, MAX_BODY, shouldPinByDefault, type GuestNote, type NoteTone } from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";

export interface ComposerResult {
  tone: NoteTone;
  title: string;
  body: string;
  pinned: boolean;
}

/**
 * Centred over a blurred backdrop rather than a bottom sheet: a sheet on a
 * landscape tablet puts the fields under the on-screen keyboard, which is
 * exactly where reception is typing.
 */
export default function NoteComposer({
  open,
  existing,
  onSave,
  onCancel,
}: {
  open: boolean;
  existing?: GuestNote | null;
  onSave: (r: ComposerResult) => void;
  onCancel: () => void;
}) {
  const [tone, setTone] = useState<NoteTone>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pinTouched, setPinTouched] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTone(existing?.tone ?? "info");
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    setPinned(existing?.pinned ?? shouldPinByDefault(existing?.tone ?? "info"));
    setPinTouched(!!existing);
    const id = setTimeout(() => titleRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open, existing]);

  // Choosing "Alerte" pins the note unless the user has already made their own
  // decision about pinning. An allergy that needs a second deliberate tap to
  // become visible is an allergy that gets missed.
  const pickTone = (t: NoteTone) => {
    setTone(t);
    if (!pinTouched) setPinned(shouldPinByDefault(t));
  };

  if (!open) return null;
  const canSave = title.trim().length > 0 || body.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-[noteFade_.16s_ease-out]"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={existing ? "Modifier la note" : "Nouvelle note"}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-role="note-composer"
        /* dvh, not vh: when the tablet keyboard opens, vh keeps the old height
           and pushes Terminé off-screen. The body scrolls and the action bar
           stays put. */
        className="w-full max-w-[460px] max-h-[86dvh] flex flex-col rounded-[24px] animate-[notePop_.22s_cubic-bezier(.175,.885,.32,1.35)]"
        style={{ background: "var(--color-card,#fff)", boxShadow: "0 28px 70px -20px rgba(60,40,10,.45)" }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[13px] font-extrabold" style={{ color: "var(--tab-idle)" }}>
            {existing ? "Modifier la note" : "Nouvelle note"}
          </span>
          <button onClick={onCancel} aria-label="Fermer" className="w-11 h-11 rounded-full grid place-items-center glass-liquid">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5">
          {/* What you came here to write goes first and is the biggest thing on
              the panel. The tone row used to sit above these fields and wrap to
              five rows in a narrow column, which made classifying the note look
              more important than writing it. */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
            placeholder="Titre — ex. Allergie arachide"
            maxLength={MAX_TITLE}
            data-role="note-title"
            className="w-full min-h-[58px] px-4 rounded-[16px] text-[20px] font-bold text-dark mb-2.5 focus:outline-none focus:ring-2 focus:ring-brand/40"
            style={{ background: "rgba(0,0,0,.05)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.07)" }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            placeholder="Détail — ce que la réception doit savoir"
            rows={5}
            maxLength={MAX_BODY}
            data-role="note-body"
            className="w-full px-4 py-3.5 rounded-[16px] text-[17px] leading-relaxed text-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand/40"
            style={{ background: "rgba(0,0,0,.05)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.07)" }}
          />

          {/* Classification second, and quiet: a fixed 3-column grid so it can
              never grow into a five-row stack. */}
          <div className="text-[10px] uppercase tracking-wider font-bold mt-4 mb-2" style={{ color: "var(--tab-idle)" }}>
            Type de note
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {TONES.map((tn) => {
              const m = toneMeta(tn);
              const on = tone === tn;
              return (
                <button
                  key={tn}
                  onClick={() => pickTone(tn)}
                  aria-pressed={on}
                  data-role="note-tone"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-1.5 rounded-[12px] text-[12px] font-bold transition-all active:scale-[0.97]"
                  style={on
                    ? { background: m.soft, color: m.color, boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                    : { background: "rgba(0,0,0,.035)", color: "var(--tab-idle)" }}
                >
                  <NoteToneIcon tone={tn} size={14} color={on ? m.color : "var(--tab-idle)"} />
                  {m.label}
                </button>
              );
            })}
            <button
              onClick={() => { setPinned((p) => !p); setPinTouched(true); }}
              aria-pressed={pinned}
              className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-1.5 rounded-[12px] text-[12px] font-bold transition-all active:scale-[0.97]"
              style={pinned
                ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
                : { background: "rgba(0,0,0,.035)", color: "var(--tab-idle)" }}
            >
              <PushPin weight={pinned ? "fill" : "duotone"} size={14} />
              {pinned ? "Épinglée" : "Épingler"}
            </button>
          </div>
        </div>

        <div className="shrink-0 px-5 pt-3 pb-4">
        <button
          onClick={() => canSave && onSave({ tone, title: title.trim(), body: body.trim(), pinned })}
          disabled={!canSave}
          data-role="note-save"
          className="w-full min-h-[54px] rounded-[44px] text-white text-[17px] font-black inline-flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40"
          style={{ background: "var(--aur-good)", boxShadow: "0 8px 24px -10px rgba(47,111,79,.45)" }}
        >
          <Check weight="bold" size={19} /> Terminé
        </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes noteFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes notePop { from { opacity: 0; transform: scale(.93) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}
