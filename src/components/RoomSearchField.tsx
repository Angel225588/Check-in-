"use client";
import { MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";

/**
 * One field, filled by the app's own pads.
 *
 * It is a real input, so a Bluetooth keyboard at the desk types straight into
 * it — but inputMode="none" keeps iOS from raising the on-screen keyboard when
 * it takes focus. That keyboard covered half a landscape iPad and left the
 * layout wedged.
 *
 * The accented-name argument for the system keyboard does not hold: search
 * folds diacritics, so "lefevre" finds LEFÈVRE (search-accents.test.ts).
 */
export default function RoomSearchField({
  value,
  onChange,
  onClear,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 min-h-[84px] rounded-[24px] surface-field"
      data-role="search-field"
    >
      <MagnifyingGlass size={27} weight="bold" style={{ color: "var(--tab-idle)" }} className="shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Chambre ou nom du client…"
        autoComplete="off"
        inputMode="none"
        enterKeyHint="search"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
        aria-label="Chercher une chambre ou un client"
        // self-stretch, so the tap target is the whole 84px band rather than
        // the 42px the glyphs happen to occupy: on a tablet you aim at the
        // field, not at the text inside it.
        className="flex-1 min-w-0 self-stretch bg-transparent outline-none text-[28px] font-bold text-dark placeholder:font-normal placeholder:italic placeholder:text-[26px]"
        style={{ fontFamily: "inherit" }}
      />
      {value && (
        <button
          onClick={onClear}
          aria-label="Effacer"
          className="w-12 h-12 shrink-0 rounded-full grid place-items-center bg-black/[0.06] dark:bg-white/[0.08] active:scale-[0.94] transition-transform"
        >
          <X size={17} weight="bold" />
        </button>
      )}
    </div>
  );
}
