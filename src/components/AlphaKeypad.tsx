"use client";

interface AlphaKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

/**
 * AZERTY, full width.
 *
 * The first version was alphabetical and six columns wide, because it had to
 * fit the 392px keypad column and ten columns there would have meant 29px keys.
 * That solved the wrong problem: reception already knows AZERTY, and a layout
 * you have to read is slower than one your hands know, however tidy the grid.
 *
 * So the constraint went instead of the layout. In letter mode the keyboard
 * spans the whole screen the way a real keyboard does, which gives ten columns
 * ~105px each on a landscape iPad — bigger targets than the numeric pad has.
 *
 * No accented keys: search folds diacritics, so "lefevre" finds LEFÈVRE
 * (search-accents.test.ts). Adding È and Ç would cost a row to type nothing
 * new.
 */
export default function AlphaKeypad({
  onKeyPress,
  onBackspace,
  onToggleMode,
}: AlphaKeypadProps) {
  const rows = [
    ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
    ["W", "X", "C", "V", "B", "N"],
  ];

  const press = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  const key =
    "glass-key rounded-lg md:rounded-xl flex-1 min-w-0 min-h-[clamp(42px,7.4vh,72px)] text-lg md:text-2xl font-bold active:scale-95 transition-transform select-none";

  return (
    <div
      className="glass-surface rounded-[14px] p-1.5 md:p-3 flex flex-col gap-1.5 md:gap-2 w-full h-full"
      role="group"
      aria-label="Letter keypad"
      /* none, not manipulation: manipulation still lets the browser
         consider the touch a pan and wait to see. A key is never a
         scroll — the portrait page does not scroll at all — so the
         browser has nothing to decide and the digit lands at once. */
      style={{ touchAction: "none" }}
      data-role="alpha-keypad"
    >
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1.5 md:gap-2 flex-1 min-h-0">
          {/* The third row is short, so it centres rather than stretching six
              keys across ten columns' worth of width. */}
          {i === 2 && <span className="flex-[2] min-w-0" aria-hidden />}
          {row.map((k) => (
            <button key={k} {...press(() => onKeyPress(k.toLowerCase()))} className={key}>
              {k}
            </button>
          ))}
          {i === 2 && <span className="flex-[2] min-w-0" aria-hidden />}
        </div>
      ))}

      <div className="flex gap-1.5 md:gap-2 flex-1 min-h-0">
        <button
          {...press(onToggleMode)}
          data-role="pad-123"
          className="flex-[2] min-w-0 bg-teal/90 text-white rounded-lg md:rounded-xl min-h-[clamp(42px,7.4vh,72px)] text-base font-bold active:scale-95 transition-transform select-none"
        >
          123
        </button>
        <button
          {...press(() => onKeyPress(" "))}
          aria-label="Espace"
          className={`${key} flex-[6] text-[14px] uppercase tracking-[0.14em]`}
        >
          Espace
        </button>
        <button
          {...press(onBackspace)}
          aria-label="Backspace"
          className="flex-[2] min-w-0 bg-slate/90 text-white rounded-lg md:rounded-xl min-h-[clamp(42px,7.4vh,72px)] active:scale-95 transition-transform select-none"
        >
          <svg className="w-7 h-7 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
