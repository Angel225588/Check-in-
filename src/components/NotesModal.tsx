"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  X, CaretLeft, Plus, PushPin, PencilSimple, Trash, CaretDown, WarningCircle, MagnifyingGlass, Check,
} from "@phosphor-icons/react/dist/ssr";
import {
  filterNotes, TONES, MAX_TITLE, MAX_BODY, shouldPinByDefault,
  type GuestNote, type NoteTone,
} from "@/lib/notes";
import { toneMeta } from "@/lib/note-tone";
import NoteToneIcon from "./NoteToneIcon";
import type { NotesApi } from "@/hooks/useGuestNotes";

/** Past this many notes a search field earns its height; below it, the tone
 *  filters are enough and the field only competes with the keyboard. */
const SEARCH_AFTER = 8;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

type View = "list" | "compose" | "detail";

/**
 * Notes live in a centred panel, not the 248px activity column.
 *
 * A narrow column is a poor place to read a paragraph and a worse one to write
 * in. The panel keeps one position across all three views, so the eye never
 * has to find it again, and it is sized against the VISIBLE viewport so the
 * tablet keyboard shrinks it rather than burying the save button.
 */
export default function NotesModal({
  open, onClose, api, roomNumber, guestName, visits, pax,
}: {
  open: boolean;
  onClose: () => void;
  api: NotesApi;
  roomNumber: string;
  guestName: string;
  visits: number;
  pax: number;
}) {
  const [view, setView] = useState<View>("list");
  const [tone, setTone] = useState<NoteTone | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // composer state
  const [cTone, setCTone] = useState<NoteTone>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pinTouched, setPinTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRev, setShowRev] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setView("list"); setSelectedId(null); setQ(""); setConfirmDelete(false); }
  }, [open]);

  useEffect(() => {
    if (view === "compose") {
      const id = setTimeout(() => titleRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [view]);

  const selected = api.notes.find((n) => n.id === selectedId) ?? null;
  const visible = useMemo(() => {
    const base = filterNotes(api.notes, tone);
    if (!q.trim()) return base;
    return base.filter((n) => fold(n.title + " " + n.body).includes(fold(q)));
  }, [api.notes, tone, q]);

  if (!open) return null;

  const startNew = () => {
    setEditingId(null); setCTone("info"); setTitle(""); setBody("");
    setPinned(false); setPinTouched(false); setView("compose");
  };
  const startEdit = (n: GuestNote) => {
    setEditingId(n.id); setCTone(n.tone); setTitle(n.title); setBody(n.body);
    setPinned(n.pinned); setPinTouched(true); setView("compose");
  };
  const pickTone = (t: NoteTone) => {
    setCTone(t);
    if (!pinTouched) setPinned(shouldPinByDefault(t));
  };
  const save = async () => {
    if (!title.trim() && !body.trim()) return;
    const payload = { tone: cTone, title: title.trim(), body: body.trim(), pinned };
    if (editingId) await api.edit(editingId, payload);
    else await api.add(payload);
    setView("list");
  };

  const heading =
    view === "compose" ? (editingId ? "Modifier la note" : "Nouvelle note")
    : view === "detail" ? "Note"
    : `Notes — ${guestName}`;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45 backdrop-blur-md animate-[nFade_.18s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Notes du client"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-role="notes-modal"
        /* dvh so the tablet keyboard shrinks the panel instead of pushing the
           action bar off-screen. */
        className="w-full max-w-[760px] max-h-[88dvh] flex flex-col rounded-[26px] overflow-hidden animate-[nPop_.26s_cubic-bezier(.2,.9,.25,1)]"
        style={{
          background: "var(--color-card,#fff)",
          boxShadow: "0 40px 90px -24px rgba(40,26,6,.55), inset 0 1px 0 rgba(255,255,255,.07)",
        }}
      >
        {/* ── header ── */}
        <div className="shrink-0 flex items-center gap-5 px-6 pt-6 pb-5 border-b border-black/[0.06] dark:border-white/[0.07]">
          <div className="text-[44px] font-black leading-none tracking-[-0.035em] tabular-nums">{roomNumber}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[21px] font-bold leading-tight truncate">{heading}</div>
            <div className="text-[13px] font-semibold mt-1" style={{ color: "var(--tab-idle)" }}>
              {visits > 0 ? `Habitué · ${visits}ᵉ séjour` : "1ʳᵉ visite"} · {pax} pers.
            </div>
          </div>
          {/* The slot is reserved even when empty, so ✕ never slides sideways. */}
          <button
            onClick={() => { setView("list"); setConfirmDelete(false); }}
            aria-label="Retour"
            data-role="notes-back"
            style={{ visibility: view === "list" ? "hidden" : "visible" }}
            className="w-12 h-12 rounded-full grid place-items-center shrink-0 bg-black/[0.05] dark:bg-white/[0.06] active:scale-[0.94] transition-transform"
          >
            <CaretLeft size={18} weight="bold" />
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-12 h-12 rounded-full grid place-items-center shrink-0 bg-black/[0.05] dark:bg-white/[0.06] active:scale-[0.94] transition-transform"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {api.saveError && (
          <div className="shrink-0 mx-6 mt-4 flex items-start gap-2.5 rounded-[14px] px-4 py-3" style={{ background: "var(--aur-bad-soft)" }}>
            <WarningCircle weight="duotone" size={18} color="var(--aur-bad-ink)" className="shrink-0 mt-0.5" />
            <div className="text-[13px] font-bold leading-snug" style={{ color: "var(--aur-bad-ink)" }}>
              Note NON enregistrée — stockage plein.
              <button onClick={api.clearError} className="underline ml-1.5 font-black">Fermer</button>
            </div>
          </div>
        )}

        {/* ── body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {view === "list" && (
            <>
              {api.notes.length > SEARCH_AFTER && (
                <div className="flex items-center gap-3 px-4 min-h-[54px] rounded-[16px] mb-4 bg-black/[0.045] dark:bg-white/[0.055]">
                  <MagnifyingGlass size={19} style={{ color: "var(--tab-idle)" }} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Chercher dans les notes…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[16px] font-bold text-dark placeholder:font-normal placeholder:italic"
                  />
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-3.5 -mx-1 px-1">
                {(["all", ...TONES] as const).map((t) => {
                  const on = tone === t;
                  const m = t === "all" ? null : toneMeta(t as NoteTone);
                  return (
                    <button
                      key={t}
                      onClick={() => setTone(t as NoteTone | "all")}
                      aria-pressed={on}
                      className="shrink-0 inline-flex items-center gap-1.5 min-h-[46px] px-4 rounded-full text-[13px] font-extrabold transition-all active:scale-[0.97]"
                      style={on
                        ? { background: m ? m.soft : "rgba(0,0,0,.09)", color: m ? m.color : undefined, boxShadow: `inset 0 0 0 1.5px ${m ? m.color : "rgba(0,0,0,.22)"}` }
                        : { background: "rgba(0,0,0,.04)", color: "var(--tab-idle)" }}
                    >
                      {m && <NoteToneIcon tone={t as NoteTone} size={14} color={on ? m.color : "var(--tab-idle)"} />}
                      {m ? m.label : "Tout"}
                    </button>
                  );
                })}
              </div>

              {!api.ready && (
                <div className="text-[13.5px] text-center py-14" style={{ color: "var(--tab-idle)" }}>Déchiffrement…</div>
              )}
              {api.ready && visible.length === 0 && (
                <div className="text-center py-14 leading-relaxed" style={{ color: "var(--tab-idle)" }}>
                  <div className="text-[15px] font-bold">Aucune note{tone !== "all" || q ? " ne correspond" : " pour ce client"}.</div>
                  <div className="text-[13.5px] mt-1.5 opacity-90">Allergie, préférence, événement…</div>
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                {visible.map((n) => {
                  const m = toneMeta(n.tone);
                  const isAlert = n.tone === "alert";
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedId(n.id); setView("detail"); setConfirmDelete(false); setShowRev(false); }}
                      data-role="note-row"
                      data-note-tone={n.tone}
                      className="relative w-full text-left rounded-[16px] pl-5 pr-4 py-4 overflow-hidden active:scale-[0.995] transition-transform"
                      style={{
                        background: isAlert ? m.soft : "rgba(0,0,0,.035)",
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
                      }}
                    >
                      <span className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: m.color }} />
                      <div className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16.5px] font-extrabold leading-snug" style={{ color: isAlert ? m.color : undefined }}>
                            {n.title || n.body.slice(0, 60)}
                          </span>
                          {n.body && n.title && (
                            <span className="block text-[13.5px] leading-relaxed mt-1 line-clamp-2" style={{ color: "var(--tab-idle)" }}>{n.body}</span>
                          )}
                          <span className="block text-[11.5px] font-bold mt-2" style={{ color: "var(--tab-idle)", opacity: .85 }}>
                            {m.label} · {n.author || "—"} · {fmt(n.createdAt)}
                          </span>
                        </span>
                        {n.pinned && <PushPin weight="fill" size={14} className="shrink-0 mt-1" style={{ color: m.color }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "compose" && (
            <>
              {/* A slim tab strip, not a grid of large chips: classification must
                  never out-weigh the note (R14b/R14c). */}
              <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1">
                {TONES.map((tn) => {
                  const m = toneMeta(tn);
                  const on = cTone === tn;
                  return (
                    <button
                      key={tn}
                      onClick={() => pickTone(tn)}
                      aria-pressed={on}
                      data-role="note-tone"
                      className="shrink-0 inline-flex items-center gap-2 min-h-[46px] px-4 rounded-full text-[13.5px] font-extrabold transition-all active:scale-[0.97]"
                      style={on
                        ? { background: m.soft, color: m.color, boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                        : { background: "rgba(0,0,0,.04)", color: "var(--tab-idle)" }}
                    >
                      <NoteToneIcon tone={tn} size={15} color={on ? m.color : "var(--tab-idle)"} />
                      {m.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => { setPinned((p) => !p); setPinTouched(true); }}
                  aria-pressed={pinned}
                  className="shrink-0 inline-flex items-center gap-2 min-h-[46px] px-4 rounded-full text-[13.5px] font-extrabold transition-all active:scale-[0.97]"
                  style={pinned
                    ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
                    : { background: "rgba(0,0,0,.04)", color: "var(--tab-idle)" }}
                >
                  <PushPin weight={pinned ? "fill" : "duotone"} size={15} />
                  {pinned ? "Épinglée" : "Épingler"}
                </button>
              </div>

              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="Titre — ex. Allergie arachide"
                maxLength={MAX_TITLE}
                data-role="note-title"
                className="w-full min-h-[64px] px-5 rounded-[18px] text-[22px] font-extrabold text-dark mb-3 focus:outline-none focus:ring-2 focus:ring-brand/40 placeholder:font-normal placeholder:italic"
                style={{ background: "rgba(0,0,0,.045)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" }}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                placeholder="Ce que la réception doit savoir…"
                rows={7}
                maxLength={MAX_BODY}
                data-role="note-body"
                className="w-full min-h-[190px] px-5 py-4 rounded-[18px] text-[17.5px] leading-relaxed text-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand/40 placeholder:font-normal placeholder:italic"
                style={{ background: "rgba(0,0,0,.045)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)" }}
              />
            </>
          )}

          {view === "detail" && selected && (
            <>
              <span
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-black mb-4"
                style={{ background: toneMeta(selected.tone).soft, color: toneMeta(selected.tone).color }}
              >
                <NoteToneIcon tone={selected.tone} size={15} /> {toneMeta(selected.tone).label}
                {selected.pinned && <PushPin weight="fill" size={13} />}
              </span>
              {selected.title && (
                <h3 className="text-[27px] font-black leading-tight mb-3 break-words">{selected.title}</h3>
              )}
              {selected.body && (
                <p className="text-[17.5px] leading-relaxed text-dark/85 whitespace-pre-wrap break-words">{selected.body}</p>
              )}
              <div className="text-[13px] font-semibold mt-5" style={{ color: "var(--tab-idle)" }}>
                {selected.author ? `${selected.author} · ` : ""}{fmt(selected.createdAt)}
              </div>

              {selected.revisions.length > 0 && (
                <div className="mt-5 rounded-[14px] overflow-hidden" style={{ background: "rgba(0,0,0,.035)" }}>
                  <button
                    onClick={() => setShowRev((v) => !v)}
                    aria-expanded={showRev}
                    className="w-full min-h-[48px] px-4 flex items-center justify-between text-[12.5px] font-extrabold"
                    style={{ color: "var(--tab-idle)" }}
                  >
                    Activité ({selected.revisions.length})
                    <CaretDown size={14} style={{ transform: showRev ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
                  </button>
                  {showRev && (
                    <div className="px-4 pb-3.5 flex flex-col gap-2">
                      {[...selected.revisions].reverse().map((r, i) => (
                        <div key={i} className="text-[12px] leading-snug" style={{ color: "var(--tab-idle)" }}>
                          <b className="text-dark/70">{r.author || "—"}</b> · {r.summary} · {fmt(r.at)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── action bar ── */}
        <div className="shrink-0 px-6 pt-4 pb-6 border-t border-black/[0.06] dark:border-white/[0.07]">
          {view === "list" && (
            <button
              onClick={startNew}
              data-role="note-new"
              className="w-full min-h-[58px] rounded-[44px] inline-flex items-center justify-center gap-2.5 text-white text-[17px] font-black active:scale-[0.98] transition-transform"
              style={{ background: "var(--aur-good)", boxShadow: "0 10px 26px -12px rgba(47,111,79,.6)" }}
            >
              <Plus weight="bold" size={19} /> Nouvelle note
            </button>
          )}

          {view === "compose" && (
            <button
              onClick={save}
              disabled={!title.trim() && !body.trim()}
              data-role="note-save"
              className="w-full min-h-[58px] rounded-[44px] inline-flex items-center justify-center gap-2.5 text-white text-[17px] font-black active:scale-[0.98] transition-transform disabled:opacity-40"
              style={{ background: "var(--aur-good)", boxShadow: "0 10px 26px -12px rgba(47,111,79,.6)" }}
            >
              <Check weight="bold" size={19} /> Enregistrer
            </button>
          )}

          {view === "detail" && selected && (
            confirmDelete ? (
              <div className="rounded-[18px] p-4" style={{ background: "var(--aur-bad-soft)" }}>
                <div className="text-[14px] font-black mb-3" style={{ color: "var(--aur-bad-ink)" }}>
                  Supprimer cette note définitivement ?
                </div>
                <div className="flex gap-2.5">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 min-h-[48px] rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-[14px] font-bold">
                    Annuler
                  </button>
                  <button
                    onClick={async () => { await api.remove(selected.id); setConfirmDelete(false); setView("list"); }}
                    data-role="note-delete-confirm"
                    className="flex-1 min-h-[48px] rounded-full text-white text-[14px] font-black"
                    style={{ background: "var(--aur-bad)" }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5 items-center">
                {/* Destructive action sits away from the thumb-line of the two
                    controls used constantly, and still asks before acting. */}
                <button
                  onClick={() => setConfirmDelete(true)}
                  data-role="note-delete"
                  aria-label="Supprimer la note"
                  className="w-[58px] min-h-[54px] rounded-[18px] grid place-items-center"
                  style={{ color: "var(--tab-idle)", background: "rgba(0,0,0,.035)" }}
                >
                  <Trash size={19} />
                </button>
                <button
                  onClick={() => api.pin(selected.id)}
                  aria-pressed={selected.pinned}
                  className="flex-1 min-h-[54px] rounded-full inline-flex items-center justify-center gap-2 text-[14.5px] font-extrabold"
                  style={selected.pinned
                    ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--color-brand)" }
                    : { background: "rgba(0,0,0,.05)", color: "var(--tab-idle)" }}
                >
                  <PushPin weight={selected.pinned ? "fill" : "duotone"} size={16} />
                  {selected.pinned ? "Épinglée" : "Épingler"}
                </button>
                <button
                  onClick={() => startEdit(selected)}
                  data-role="note-edit"
                  className="flex-1 min-h-[54px] rounded-full inline-flex items-center justify-center gap-2 text-white text-[14.5px] font-black"
                  style={{ background: "var(--color-brand)" }}
                >
                  <PencilSimple weight="bold" size={16} /> Modifier
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes nFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nPop { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
