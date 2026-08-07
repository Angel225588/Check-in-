"use client";
import { Check, WarningCircle, NotePencil, List } from "@phosphor-icons/react/dist/ssr";
import { Client, CheckInRecord } from "@/lib/types";
import { portraitSlot } from "@/lib/portrait";
import { capRows } from "@/lib/row-cap";
import PortraitMetrics from "@/components/portrait/PortraitMetrics";
import RoomSearchField from "@/components/RoomSearchField";
import PreviewCarousel, { type Pane } from "@/components/PreviewCarousel";
import SuggestionCard from "@/components/SuggestionCard";
import NumericKeypad from "@/components/NumericKeypad";
import AlphaKeypad from "@/components/AlphaKeypad";
import type { MetricFilter } from "@/components/MetricsBar";

/**
 * The check-in screen, one column and one thumb.
 *
 * Three commitments, in the order they were decided:
 *
 * 1. The pad never leaves (US-P1). Not hide-on-scroll — hiding a toolbar while
 *    you scroll is a *reading* pattern, and the moment you scroll the results
 *    is the moment you are deciding, so it is the worst possible moment to take
 *    the commit button away. Everything else is what fits above it.
 *
 * 2. The card and the list take turns (US-P2, Option B). At 320px, keeping both
 *    shrinks the card until the allergy chip has nowhere to go — the one thing
 *    this screen exists to protect. `portraitSlot` holds the rule.
 *
 * 3. The four service controls keep their icons and their words, behind the
 *    burger (US-P4). The same tool must not introduce itself twice.
 */
export default function PortraitSearch({
  clients,
  checkIns,
  query,
  setQuery,
  clear,
  results,
  hit,
  hitPanes,
  idlePanes,
  filteredClients,
  activeFilter,
  onFilterChange,
  onMenu,
  handSide,
  chosenMetrics,
  onChooseMetrics,
  idlePreview,
  onSelectRoom,
  onCompose,
  onAddRoom,
  expected,
  swipe,
  pad,
  setPad,
  onPadToggle,
  appendKey,
  backspace,
  count,
  setCount,
  maxCount,
  needsScreen,
  onCommit,
  flash,
  saveFailed,
  onDismissError,
  clientIndexOf,
}: {
  clients: Client[];
  checkIns: CheckInRecord[];
  query: string;
  setQuery: (v: string) => void;
  clear: () => void;
  results: Client[];
  hit: Client | null;
  hitPanes: Pane[];
  idlePanes: Pane[];
  filteredClients: Client[];
  activeFilter: MetricFilter;
  onFilterChange: (f: MetricFilter) => void;
  onMenu: () => void;
  /** The drawer and its button live on the hand that is free. */
  handSide: "left" | "right";
  chosenMetrics?: string[] | null;
  onChooseMetrics: (next: string[]) => void;
  /** The frame at rest. Off, the pad and the list have the screen to
   *  themselves — the resolved guest card is never affected. */
  idlePreview: boolean;
  onSelectRoom: (room: string, index?: number, people?: number) => void;
  onCompose: (c: Client) => void;
  onAddRoom: () => void;
  expected?: { people: number; basedOn: string | null };
  swipe: boolean;
  pad: "num" | "abc";
  setPad: (p: "num" | "abc") => void;
  /** Switching alphabet clears the search — except mid-note, where that would
   *  drop the guest the note is about. */
  onPadToggle: (next: "num" | "abc") => void;
  appendKey: (k: string) => void;
  backspace: () => void;
  count: number;
  setCount: (fn: (c: number) => number) => void;
  maxCount: number;
  needsScreen: boolean;
  onCommit: () => void;
  flash: { room: string; n: number } | null;
  saveFailed: boolean;
  onDismissError: () => void;
  clientIndexOf: (c: Client) => number;
}) {
  const slot = portraitSlot({
    query,
    filter: activeFilter,
    hasHit: !!hit,
    flash: !!flash,
  });

  /* Capped, and never silently: one digit into a full house matches a third
     of it, and drawing all of them is what made the first keystroke slow. */
  const { shown: rows, more: hiddenRows } = capRows(query ? results : filteredClients);

  /* Landscape's idle slot is 240px, so it opens on the clock and the clock
     fills it. Portrait's is three times that, and a clock centred in 800px of
     nothing is what the tablet actually showed. Every reference for this shape
     agrees: Cash App gives the spare height to the keys, Strava and Hevy fill
     it with time-stamped rows. Nobody frames an empty box.

     So portrait opens on Récents — which is also what the approved sketch drew
     — and keeps the same three faces in the same carousel. Order, not
     membership: nothing moves, nothing is lost. */
  const PORTRAIT_IDLE = ["recents", "expected", "clock"];
  const idleForPortrait = [...idlePanes].sort(
    (a, b) => PORTRAIT_IDLE.indexOf(a.key) - PORTRAIT_IDLE.indexOf(b.key)
  );
  /* One frame, one place, one size.
     
     The frame sits directly under the search field and takes the width but not
     the height: on an iPad stood up it was a 900px square, which is not a card,
     it is a wall. Card-sized and always in the same spot means the eye learns
     where to look once — it does not move between resting and resolved, and it
     does not resize when the guest has more to say than the clock. */
  const FRAME = "shrink-0 h-[clamp(150px,28vh,340px)] max-h-full flex flex-col";
  const bubble =
    "w-[clamp(56px,8.5vh,72px)] h-[clamp(56px,8.5vh,72px)] shrink-0 rounded-full text-[30px] font-black grid place-items-center surface-chrome active:scale-[0.92] transition-transform disabled:opacity-25";

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden bg-[#FBF8F3] dark:bg-[#12100E]"
      data-role="portrait-shell"
    >
      {/* Top: where we are, then what you are looking for. Both fixed — the
          numbers are read between guests, not scrolled to. */}
      <div className="shrink-0 flex flex-col gap-2 px-2.5 pt-2.5">
        {/* The menu is not a metric. Inside the tinted bar it read as a fifth
            pill; beside it, it reads as what it is. */}
        <div className={`flex items-stretch gap-2 ${handSide === "right" ? "flex-row-reverse" : ""}`}>
          <button
            onClick={onMenu}
            data-role="portrait-menu"
            aria-label="Ouvrir le menu du service"
            className="surface-raised w-[56px] shrink-0 min-h-[64px] rounded-[16px] grid place-items-center active:scale-[0.94] transition-[transform,box-shadow] duration-100"
          >
            <List size={22} weight="bold" style={{ color: "var(--brand-ink)" }} />
          </button>
          <div className="flex-1 min-w-0">
            <PortraitMetrics
              clients={clients}
              checkIns={checkIns}
              activeFilter={activeFilter}
              onFilterChange={onFilterChange}
              expected={expected}
              chosen={chosenMetrics}
              onChoose={onChooseMetrics}
            />
          </div>
        </div>
        <RoomSearchField value={query} onChange={setQuery} onClear={clear} />
      </div>

      {/* The one body slot. Its height never changes; only its face does. */}
      <div
        className="flex-1 min-h-[96px] overflow-hidden flex flex-col px-2.5 py-2"
        data-role="portrait-slot"
        data-slot={slot}
      >
        {/* Resolved: the guest, and nothing else. Anything sharing the screen
            with the person in front of you is something to read past. */}
        {slot === "card" && hit && (
          <div className={FRAME}>
            <PreviewCarousel
            panes={hitPanes}
            auto={false}
            swipe={swipe}
            resetKey={hit.roomNumber}
            actionHiddenOn={["notes"]}
            action={
              <button
                onClick={() => onCompose(hit)}
                data-role="preview-compose"
                aria-label={`Écrire une note pour la chambre ${hit.roomNumber}`}
                className="w-11 h-11 rounded-[14px] grid place-items-center active:scale-[0.92] transition-transform"
                style={hit.isVip
                  ? { background: "rgba(0,0,0,.34)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22)" }
                  : { background: "var(--aur-gold-soft-2)", boxShadow: "inset 0 0 0 1px var(--aur-hairline)" }}
              >
                <NotePencil size={19} weight="duotone" style={{ color: hit.isVip ? "#fff" : "var(--brand-ink)" }} />
              </button>
            }
          />
          </div>
        )}

        {slot === "idle" && idlePreview && (
          <div className={FRAME}>
            <PreviewCarousel panes={idleForPortrait} auto swipe={swipe} resetKey="idle" />
          </div>
        )}

        {slot === "flash" && flash && (
          <div
            data-role="checkin-flash"
            className="flex-1 rounded-[24px] px-5 flex flex-col justify-center gap-1 text-white animate-[cardIn_.3s_cubic-bezier(.2,.9,.25,1)]"
            style={{ background: "linear-gradient(150deg,#357D58,#255B41)", boxShadow: "0 16px 44px -14px rgba(30,80,55,.55)" }}
          >
            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] opacity-90">
              <Check weight="bold" size={14} /> Enregistré
            </span>
            <span className="text-[clamp(34px,11vw,54px)] font-black leading-[0.9] tracking-[-0.045em] tabular-nums">
              {flash.room}
            </span>
            <span className="text-[15px] font-bold">{flash.n} pers. entrées</span>
          </div>
        )}

        {slot === "list" && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 -mx-0.5 px-0.5">
            {rows.map((client, i) => {
              const ci = clientIndexOf(client);
              return (
                <SuggestionCard
                  key={`${client.roomNumber}-${i}`}
                  client={client}
                  checkIns={checkIns}
                  onSelect={onSelectRoom}
                  clientIndex={ci >= 0 ? ci : undefined}
                />
              );
            })}
            {query && results.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-5">
                <div className="text-muted text-sm">Aucune chambre trouvée</div>
                <button
                  onClick={onAddRoom}
                  className="px-5 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all"
                >
                  Ajouter {query}
                </button>
              </div>
            )}
            {hiddenRows > 0 && (
              <div className="text-center py-3 text-[13px] font-bold text-muted" data-role="rows-capped">
                +{hiddenRows} autre{hiddenRows > 1 ? "s" : ""} — tapez un chiffre de plus
              </div>
            )}
            {!query && rows.length === 0 && (
              <div className="text-center text-muted py-4 text-sm">Aucune chambre dans ce filtre</div>
            )}
          </div>
        )}
      </div>

      {/* The dock. Fixed by construction: everything above it is the flexible
          part, so no scroll position and no state can move it. */}
      <div className="shrink-0 flex flex-col gap-2 px-2.5 pb-2.5" data-role="portrait-dock">
        {saveFailed && (
          <div
            data-role="checkin-save-error"
            className="flex items-start gap-2 rounded-[14px] px-3 py-2.5"
            style={{ background: "var(--aur-bad-soft)", boxShadow: "inset 0 0 0 1.5px var(--aur-bad)" }}
          >
            <WarningCircle weight="duotone" size={18} color="var(--aur-bad-ink)" className="shrink-0 mt-0.5" />
            <div className="text-[12.5px] font-bold leading-snug" style={{ color: "var(--aur-bad-ink)" }}>
              NON enregistré — stockage plein. Ouvrez la fiche et réessayez.
              <button onClick={onDismissError} className="underline ml-1 font-black">Fermer</button>
            </div>
          </div>
        )}

        <div className="flex gap-2" data-role="search-cta">
          <button
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            disabled={!hit || count <= 1}
            aria-label="Une personne de moins"
            className={bubble}
          >
            −
          </button>
          <button
            onClick={() =>
              needsScreen
                ? hit && onSelectRoom(hit.roomNumber, clientIndexOf(hit), maxCount > 0 ? count : undefined)
                : onCommit()
            }
            disabled={!hit}
            data-role="search-enter"
            data-mode={!hit ? "idle" : needsScreen ? "open" : "commit"}
            className="flex-1 min-h-[clamp(56px,8.5vh,72px)] rounded-full text-white text-[19px] font-black inline-flex items-center justify-center gap-2.5 transition-transform active:scale-[0.98] disabled:opacity-35"
            style={hit && needsScreen
              ? { background: "linear-gradient(135deg,#A66914,#8A5010)", boxShadow: "0 10px 26px -12px rgba(120,74,12,.6)" }
              : { background: "var(--aur-good)", boxShadow: "0 10px 26px -12px rgba(47,111,79,.6)" }}
          >
            {!hit ? (
              "Entrer"
            ) : maxCount === 0 ? (
              "Ouvrir la fiche"
            ) : needsScreen ? (
              <>Vérifier <b className="text-[26px] tabular-nums">{count}</b></>
            ) : (
              <><Check weight="bold" size={21} /> Entrer <b className="text-[26px] tabular-nums">{count}</b></>
            )}
          </button>
          <button
            onClick={() => setCount((c) => Math.min(Math.max(1, maxCount), c + 1))}
            disabled={!hit || count >= maxCount}
            aria-label="Une personne de plus"
            className={bubble}
          >
            +
          </button>
        </div>

        {/* Both pads occupy the same box, so switching alphabet does not move
            the commit button one pixel. */}
        {/* One box for both alphabets, and a floor the shortest phone can
            still afford: 4 rows of 42px keys. Anything taller and the dock
            pushes itself off a 568px screen — which is exactly the failure
            R25a exists to catch. */}
        <div className="h-[clamp(210px,38vh,340px)]">
          {pad === "num" ? (
            <NumericKeypad
              onKeyPress={appendKey}
              onBackspace={backspace}
              onToggleMode={() => onPadToggle("abc")}
            />
          ) : (
            <AlphaKeypad
              onKeyPress={appendKey}
              onBackspace={backspace}
              onToggleMode={() => onPadToggle("num")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
