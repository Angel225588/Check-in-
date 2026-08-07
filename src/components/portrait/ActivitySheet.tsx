"use client";
import { useMemo, useState } from "react";
import { X, MagnifyingGlass, FunnelSimple } from "@phosphor-icons/react/dist/ssr";
import type { RecentEntry } from "@/components/PreviewPanes";
import { Client } from "@/lib/types";
import { isComp, needsPaymentChoice, fold } from "@/lib/utils";
import { groupBlocks, isInGroupBlock } from "@/lib/groups";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import ArrivalRow from "@/components/portrait/ArrivalRow";

/**
 * The service, full screen.
 *
 * The drawer's activity list answers "who came down"; this answers "who came
 * down, and which of them was a group / a VIP / not included". It is the same
 * rows with room to breathe, a search field, and the filters that turn a
 * scroll into a lookup.
 *
 * The app owns the keyboard here as everywhere: iOS's own covers half the
 * screen and cannot be dismissed reliably, so the sheet carries the pads it
 * needs. Digits first, because a room number is what reception has.
 */
export interface ActivityRow extends RecentEntry {
  /** The booking behind the arrival, when we still have it. Absent for a room
   *  that has since left the sheet — the arrival is still true, so it is still
   *  listed, but nothing is claimed about its formule. */
  client?: Client;
}

type Lens = "all" | "vip" | "groups" | "comp" | "notincluded";

const LENSES: { key: Lens; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "vip", label: "VIP" },
  { key: "groups", label: "Groupes" },
  { key: "comp", label: "Comp" },
  { key: "notincluded", label: "Non inclus" },
];

export default function ActivitySheet({
  open,
  onClose,
  rows,
  clients,
  onPickRoom,
  onUndoRow,
}: {
  open: boolean;
  onClose: () => void;
  rows: ActivityRow[];
  clients: Client[];
  onPickRoom: (room: string) => void;
  onUndoRow: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<Lens>("all");
  const [pad, setPad] = useState<"num" | "abc">("num");

  const blocks = useMemo(() => groupBlocks(clients), [clients]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((r) => {
      if (q && !(r.roomNumber.startsWith(q) || fold(r.name).includes(q))) return false;
      if (lens === "all") return true;
      const c = r.client;
      if (!c) return false;
      switch (lens) {
        case "vip": return !!c.isVip;
        case "groups": return isInGroupBlock(c, blocks);
        case "comp": return isComp(c);
        case "notincluded": return needsPaymentChoice(c);
      }
    });
  }, [rows, query, lens, blocks]);

  // What each lens would return, so a chip that can only ever be empty says so
  // rather than being tapped and returning nothing.
  const counts = useMemo(() => {
    const n: Record<Lens, number> = { all: rows.length, vip: 0, groups: 0, comp: 0, notincluded: 0 };
    for (const r of rows) {
      const c = r.client;
      if (!c) continue;
      if (c.isVip) n.vip++;
      if (isInGroupBlock(c, blocks)) n.groups++;
      if (isComp(c)) n.comp++;
      if (needsPaymentChoice(c)) n.notincluded++;
    }
    return n;
  }, [rows, blocks]);

  if (!open) return null;

  const append = (k: string) => setQuery((p) => p + k);
  const backspace = () => setQuery((p) => p.slice(0, -1));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#FBF8F3] dark:bg-[#12100E]" data-role="activity-sheet">
      <div className="shrink-0 flex flex-col gap-2 px-2.5 pt-2.5">
        <div className="flex items-center gap-2">
          <div className="surface-field flex-1 min-w-0 flex items-center gap-3 px-4 min-h-[60px] rounded-[18px]">
            <MagnifyingGlass size={20} weight="bold" style={{ color: "var(--tab-idle)" }} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chambre ou nom…"
              inputMode="none"
              autoComplete="off"
              data-role="activity-search"
              className="flex-1 min-w-0 bg-transparent outline-none text-[18px] font-bold text-dark"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer" className="w-9 h-9 grid place-items-center shrink-0">
                <X size={15} weight="bold" style={{ color: "var(--tab-idle)" }} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            data-role="activity-close"
            aria-label="Fermer"
            className="surface-raised w-[56px] shrink-0 min-h-[60px] rounded-[16px] grid place-items-center active:scale-[0.94] transition-[transform,box-shadow] duration-100"
          >
            <X size={19} weight="bold" style={{ color: "var(--brand-ink)" }} />
          </button>
        </div>

        {/* Lenses, not a funnel: five fit across, and a chip you can see beats
            a sheet you have to open to remember what you filtered by. */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" data-role="activity-lenses">
          <FunnelSimple size={16} weight="bold" style={{ color: "var(--tab-idle)" }} className="shrink-0 self-center mr-0.5" />
          {LENSES.map((l) => {
            const on = lens === l.key;
            const empty = counts[l.key] === 0 && l.key !== "all";
            return (
              <button
                key={l.key}
                onClick={() => setLens(on ? "all" : l.key)}
                disabled={empty}
                data-role="activity-lens"
                data-lens={l.key}
                aria-pressed={on}
                className="shrink-0 min-h-[40px] px-3.5 rounded-full text-[13px] font-black transition-transform active:scale-[0.96] disabled:opacity-35"
                style={on
                  ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1.5px var(--aur-gold)" }
                  : { background: "rgba(128,128,128,.09)", color: "var(--tab-idle)" }}
              >
                {l.label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts[l.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5"
        data-role="activity-rows"
        style={{ overscrollBehavior: "contain" }}
      >
        {shown.length === 0 && (
          <span className="text-[14px] font-semibold px-1 py-6 text-center" style={{ color: "var(--tab-idle)" }}>
            {rows.length === 0 ? "Personne n'est encore entré." : "Rien avec ce filtre."}
          </span>
        )}
        {shown.map((r, i) => (
          <ArrivalRow
            key={`${r.roomNumber}-${i}`}
            row={r}
            size="roomy"
            onOpen={() => { onPickRoom(r.roomNumber); onClose(); }}
            onUndo={onUndoRow}
          >
            {/* The code, because "why did this room not pay" is the question
                the list gets asked after the fact. */}
            {r.client?.packageCode && (
              <span className="block truncate text-[11.5px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--tab-idle)" }}>
                {r.client.packageCode}
              </span>
            )}
          </ArrivalRow>
        ))}
      </div>

      <div className="shrink-0 px-2.5 pb-2.5 pb-safe h-[calc(clamp(200px,34vh,300px)+env(safe-area-inset-bottom,0px))]">
        {pad === "num" ? (
          <NumericKeypad onKeyPress={append} onBackspace={backspace} onToggleMode={() => { setQuery(""); setPad("abc"); }} />
        ) : (
          <AlphaKeypad onKeyPress={append} onBackspace={backspace} onToggleMode={() => { setQuery(""); setPad("num"); }} />
        )}
      </div>
    </div>
  );
}
