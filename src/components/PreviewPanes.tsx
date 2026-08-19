"use client";
import { useTapGuard } from "@/hooks/useTapGuard";
import { Clock, Star, ArrowUUpLeft, NotePencil } from "@phosphor-icons/react/dist/ssr";
import type { ExpectedGuest } from "./ServiceClock";

const shell =
  "flex-1 min-h-[150px] rounded-xl px-5 pt-4 pb-7 flex flex-col overflow-hidden surface-card";

const cap = "text-micro font-black uppercase tracking-[0.14em] shrink-0";

/**
 * A row you can read is a row you will try to touch.
 *
 * The panes listed rooms and names in a frame that looked exactly like every
 * other list in the app and answered to nothing. `onPick` makes each row open
 * that guest, which is what the finger was already trying to do.
 */
const row =
  "w-full text-left flex items-baseline gap-3 shrink-0 min-h-[44px] px-2 -mx-2 rounded-md " +
  "transition-transform active:scale-[0.985] active:bg-black/[0.04] dark:active:bg-white/[0.06]";

/** A row inside a swipeable frame: the click is ignored when the finger
 *  travelled, so a swipe across the list does not open whatever it landed on. */
function PaneRow({
  onPick, room, children,
}: { onPick?: (room: string) => void; room: string; children: React.ReactNode }) {
  const tap = useTapGuard(() => onPick?.(room));
  return (
    <button type="button" data-role="pane-row" disabled={!onPick} className={row} {...tap}>
      {children}
    </button>
  );
}

/** Guests we expect shortly, based on how consistently they have arrived. */
export function ExpectedPane({ expected, onPick }: { expected: ExpectedGuest[]; onPick?: (room: string) => void }) {
  return (
    <div className={shell} data-role="pane-expected">
      <span className={cap} style={{ color: "var(--tab-idle)" }}>Attendus bientôt</span>
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-2 mt-2">
        {expected.length === 0 && (
          <span className="text-sm font-semibold" style={{ color: "var(--tab-idle)" }}>
            Rien de prévisible pour l&apos;instant.
          </span>
        )}
        {expected.slice(0, 3).map((e) => (
          <PaneRow key={e.roomNumber} room={e.roomNumber} onPick={onPick}>
            <b className="text-2xl font-black tabular-nums" style={{ color: "var(--brand-ink)" }}>{e.roomNumber}</b>
            <span className="flex-1 min-w-0 truncate text-base font-bold">{e.surname}</span>
            <em className="not-italic text-sm font-bold tabular-nums" style={{ color: "var(--tab-idle)" }}>~{e.at}</em>
          </PaneRow>
        ))}
      </div>
    </div>
  );
}

export interface RecentEntry {
  /** The check-in record behind the row. Present for today's arrivals, absent
   *  for a past-stay row — you cannot undo a morning that is already closed. */
  id?: string;
  roomNumber: string;
  name: string;
  pax: number;
  at: string;
}

/**
 * The last people through the door — the "did I already do 224?" check.
 *
 * Scrolls, because the question is rarely about the last three. It centres
 * while the list is short so an almost-empty panel doesn't sit top-aligned
 * above a pool of air, and switches to a plain scroller once there is enough
 * to scroll.
 */
export function RecentsPane({ recents, onPick }: { recents: RecentEntry[]; onPick?: (room: string) => void }) {
  return (
    <div className={shell} data-role="pane-recents">
      <span className={cap} style={{ color: "var(--tab-idle)" }}>
        Récents{recents.length > 3 ? ` · ${recents.length}` : ""}
      </span>
      <div
        className={`flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-1.5 mt-2 ${
          recents.length <= 3 ? "justify-center" : ""
        }`}
        style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
      >
        {recents.length === 0 && (
          <span className="text-sm font-semibold" style={{ color: "var(--tab-idle)" }}>
            Personne n&apos;est encore entré.
          </span>
        )}
        {recents.map((r, i) => (
          <PaneRow key={`${r.roomNumber}-${i}`} room={r.roomNumber} onPick={onPick}>
            <em className="not-italic text-sm font-bold tabular-nums w-[48px]" style={{ color: "var(--tab-idle)" }}>{r.at}</em>
            <b className="text-xl font-black tabular-nums" style={{ color: "var(--brand-ink)" }}>{r.roomNumber}</b>
            <span className="flex-1 min-w-0 truncate text-sm font-bold">{r.name}</span>
            <span className="text-sm font-black tabular-nums" style={{ color: "var(--tab-idle)" }}>{r.pax}</span>
          </PaneRow>
        ))}
      </div>
    </div>
  );
}

export interface StayEntry {
  date: string;
  roomNumber: string;
  pax: number;
}

/** Prior stays, and what has already been recorded for this room today. */
export function HistoryPane({
  stays,
  today,
}: {
  stays: StayEntry[];
  today: RecentEntry[];
}) {
  return (
    <div className={shell} data-role="pane-history">
      <span className={cap} style={{ color: "var(--tab-idle)" }}>
        <Clock weight="duotone" size={13} className="inline mr-1.5 -mt-0.5" />
        Historique
      </span>
      <div
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-1.5 mt-2"
        style={{ touchAction: "pan-y", overscrollBehavior: "contain" }}
      >
        {today.length > 0 && (
          <>
            <span className="text-micro font-black uppercase tracking-[0.12em] shrink-0" style={{ color: "var(--tab-idle)" }}>
              Aujourd&apos;hui
            </span>
            {today.map((t, i) => (
              <div key={`t${i}`} className="flex items-baseline gap-2.5 text-base font-bold shrink-0 min-h-[30px]">
                <ArrowUUpLeft weight="bold" size={12} style={{ color: "var(--aur-good-ink)" }} />
                <span className="tabular-nums" style={{ color: "var(--tab-idle)" }}>{t.at}</span>
                <span className="flex-1">{t.pax} pers. entrées</span>
              </div>
            ))}
          </>
        )}
        {stays.length === 0 && today.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--brand-ink)" }}>
            <Star weight="fill" size={13} /> Première visite
          </span>
        )}
        {stays.length > 0 && (
          <span className="text-micro font-black uppercase tracking-[0.12em] mt-1 shrink-0" style={{ color: "var(--tab-idle)" }}>
            Séjours précédents · {stays.length}
          </span>
        )}
        {/* All of them, not the first four. A regular's sixteenth stay is
            exactly the guest whose history is worth reading, and the pane
            scrolls — capping it left four lines above a pool of air and quietly
            hid the other twelve. */}
        {stays.map((s, i) => (
          <div key={`s${i}`} className="flex items-baseline gap-2.5 text-base shrink-0 min-h-[30px]">
            <b className="font-extrabold tabular-nums">
              {new Date(s.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            </b>
            <span className="flex-1" style={{ color: "var(--tab-idle)" }}>
              {s.pax} pers · ch. {s.roomNumber}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
