"use client";

interface AlphaKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

/**
 * Letters, in the app rather than from the system.
 *
 * The old ABC key focused the search field, which raised the iPad keyboard —
 * half the screen gone, the layout shoved around, and no reliable way back. It
 * was there because the on-screen QWERTY had no accented characters. That
 * reason does not hold: search is accent-insensitive (`searchClients` folds
 * diacritics, see search-accents.test.ts), so "lefevre" finds LEFÈVRE and
 * nobody needs an È key.
 *
 * Alphabetical, six wide, rather than QWERTY. A 392px column cannot give ten
 * columns a 44px target — QWERTY here would be 29px keys — and reception is
 * hunting for a letter, not touch-typing, which alphabetical order serves
 * better anyway.
 *
 * Six columns by five rows rather than five by six: on the short iPad viewport
 * a sixth row squeezed every key to 27px tall. Trading a row for a column
 * keeps both dimensions above the 44px target.
 */
export default function AlphaKeypad({
  onKeyPress,
  onBackspace,
  onToggleMode,
}: AlphaKeypadProps) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");

  const press = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  const key =
    "glass-key rounded-xl min-h-0 text-lg md:text-2xl font-bold active:scale-95 transition-transform select-none";

  return (
    <div
      className="glass-surface rounded-[14px] p-2 md:p-3 grid grid-cols-6 grid-rows-5 gap-2 h-full"
      role="group"
      aria-label="Letter keypad"
      style={{ touchAction: "manipulation" }}
      data-role="alpha-keypad"
    >
      {letters.map((k) => (
        <button key={k} {...press(() => onKeyPress(k.toLowerCase()))} className={key}>
          {k}
        </button>
      ))}
      <button {...press(() => onKeyPress("y"))} className={key}>
        Y
      </button>
      <button {...press(() => onKeyPress("z"))} className={key}>
        Z
      </button>
      <button
        {...press(onToggleMode)}
        data-role="pad-123"
        className="bg-teal/90 text-white rounded-xl min-h-0 text-sm md:text-base font-bold active:scale-95 transition-transform select-none"
      >
        123
      </button>
      <button
        {...press(() => onKeyPress(" "))}
        aria-label="Espace"
        className={`${key} col-span-2 text-[13px] md:text-[15px] uppercase tracking-[0.1em]`}
      >
        Espace
      </button>
      <button
        {...press(onBackspace)}
        aria-label="Backspace"
        className="bg-slate/90 text-white rounded-xl min-h-0 active:scale-95 transition-transform select-none"
      >
        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
        </svg>
      </button>
    </div>
  );
}
