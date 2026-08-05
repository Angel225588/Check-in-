"use client";

interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

/**
 * The pad fires on press, not on click.
 *
 * A click on iOS arrives only once the browser has satisfied itself the gesture
 * was not the start of a double-tap or a scroll. That wait is perceptible when
 * you are entering three digits per guest during the rush, and it is most of
 * what "the pad is not responding well" describes. pointerdown is the moment
 * the finger lands, which is when reception expects the digit to appear.
 *
 * preventDefault on the same event suppresses the synthetic click that would
 * otherwise follow and enter the digit a second time.
 */
export default function NumericKeypad({
  onKeyPress,
  onBackspace,
  onToggleMode,
}: NumericKeypadProps) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  const press = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  const key =
    "glass-key rounded-lg md:rounded-xl min-h-[clamp(42px,7.4vh,64px)] text-xl md:text-3xl font-bold active:scale-95 transition-transform select-none";

  return (
    <div
      className="glass-surface rounded-[14px] p-1.5 md:p-3 flex flex-col gap-1.5 md:gap-2 h-full"
      role="group"
      aria-label="Numeric keypad"
      data-role="numeric-keypad"
      /* none, not manipulation: manipulation still lets the browser
         consider the touch a pan and wait to see. A key is never a
         scroll — the portrait page does not scroll at all — so the
         browser has nothing to decide and the digit lands at once. */
      style={{ touchAction: "none" }}
    >
      {keys.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-1.5 md:gap-2 flex-1 min-h-0">
          {row.map((k) => (
            <button key={k} {...press(() => onKeyPress(k))} className={key}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-1.5 md:gap-2 flex-1 min-h-0">
        <button
          {...press(onToggleMode)}
          data-role="pad-abc"
          className="bg-teal/90 text-white rounded-lg md:rounded-xl min-h-[clamp(42px,7.4vh,64px)] text-sm md:text-lg font-bold active:scale-95 transition-transform select-none"
        >
          ABC
        </button>
        <button {...press(() => onKeyPress("0"))} className={key}>
          0
        </button>
        <button
          {...press(onBackspace)}
          aria-label="Backspace"
          className="bg-slate/90 text-white rounded-lg md:rounded-xl min-h-[clamp(42px,7.4vh,64px)] text-xl active:scale-95 transition-transform select-none"
        >
          <svg className="w-6 h-6 md:w-8 md:h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
