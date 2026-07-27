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
        className="w-full max-w-[440px] max-h-[88vh] overflow-y-auto rounded-[24px] p-5 animate-[notePop_.22s_cubic-bezier(.175,.885,.32,1.35)]"
        style={{ background: "var(--color-card,#fff)", boxShadow: "0 28px 70px -20px rgba(60,40,10,.45)" }}
      >
        {/* Pin + close */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => { setPinned((p) => !p); setPinTouched(true); }}
            aria-pressed={pinned}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-[13px] font-extrabold transition-all active:scale-[0.97]"
            style={pinned
              ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
              : { background: "rgba(0,0,0,.05)", color: "var(--tab-idle)" }}
          >
            <PushPin weight={pinned ? "fill" : "duotone"} size={16} />
            {pinned ? "Épinglée" : "Épingler"}
          </button>
          <button onClick={onCancel} aria-label="Fermer" className="w-11 h-11 rounded-full grid place-items-center glass-liquid">
            <X size={16} />
          </button>
        </div>

        {/* Tone */}
        <div className="flex flex-wrap gap-2 mb-4">
          {TONES.map((tn) => {
            const m = toneMeta(tn);
            const on = tone === tn;
            return (
              <button
                key={tn}
                onClick={() => pickTone(tn)}
                aria-pressed={on}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full text-[13px] font-extrabold transition-all active:scale-[0.97]"
                style={on
                  ? { background: m.soft, color: m.color, boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                  : { background: "rgba(0,0,0,.04)", color: "var(--tab-idle)" }}
              >
                <NoteToneIcon tone={tn} size={15} color={on ? m.color : "var(--tab-idle)"} />
                {m.label}
              </button>
            );
          })}
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          placeholder="Titre — ex. Allergie arachide"
          maxLength={MAX_TITLE}
          className="w-full min-h-[48px] px-4 rounded-[14px] text-[16px] font-bold text-dark mb-2.5 focus:outline-none focus:ring-2"
          style={{ background: "rgba(0,0,0,.04)" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          placeholder="Détail — ce que la réception doit savoir"
          rows={4}
          maxLength={MAX_BODY}
          className="w-full px-4 py-3 rounded-[14px] text-[15px] text-dark resize-none focus:outline-none focus:ring-2"
          style={{ background: "rgba(0,0,0,.04)" }}
        />

        <button
          onClick={() => canSave && onSave({ tone, title: title.trim(), body: body.trim(), pinned })}
          disabled={!canSave}
          className="w-full mt-4 min-h-[52px] rounded-[44px] text-white text-[17px] font-black inline-flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-40"
          style={{ background: "var(--aur-good)", boxShadow: "0 8px 24px -10px rgba(47,111,79,.45)" }}
        >
          <Check weight="bold" size={19} /> Terminé
        </button>
      </div>

      <style jsx>{`
        @keyframes noteFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes notePop { from { opacity: 0; transform: scale(.93) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}
