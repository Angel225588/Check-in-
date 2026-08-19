"use client";

interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

/**
 * Keys you can hit without looking.
 *
 * The digits were 20px on a 42px key with a 6px gutter — a pad that asks to be
 * aimed at, during the one part of the morning where nobody has attention to
 * spare. They are 26-42px now on keys that start at 48 and grow with the
 * screen, and the gutters doubled: separation is what stops a thumb landing
 * between two keys, and it does more for accuracy than key size alone.
 *
 * The surface is cut and raised rather than glassed. It costs nothing —
 * box-shadow is not backdrop-filter — and it inverts under the finger, so the
 * key answers before React does.
 *
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
    "surface-raised rounded-lg min-h-[38px] " +
    "text-[clamp(24px,4.2vh,42px)] font-black tabular-nums " +
    "active:scale-[0.97] transition-[transform,box-shadow] duration-100 select-none";

  return (
    <div
      className="rounded-lg p-[clamp(7px,1.4vh,14px)] flex flex-col gap-[clamp(7px,1.4vh,14px)] h-full"
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
        <div key={i} className="grid grid-cols-3 gap-[clamp(7px,1.4vh,14px)] flex-1 min-h-0">
          {row.map((k) => (
            <button key={k} {...press(() => onKeyPress(k))} className={key}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-[clamp(7px,1.4vh,14px)] flex-1 min-h-0">
        <button
          {...press(onToggleMode)}
          data-role="pad-abc"
          className="bg-teal/90 text-white rounded-lg min-h-[38px] text-[clamp(15px,2.2vh,20px)] font-black tracking-[0.06em] active:scale-[0.97] transition-transform select-none"
        >
          ABC
        </button>
        <button {...press(() => onKeyPress("0"))} className={key}>
          0
        </button>
        <button
          {...press(onBackspace)}
          aria-label="Backspace"
          className="bg-slate/90 text-white rounded-lg min-h-[38px] active:scale-[0.97] transition-transform select-none"
        >
          <svg className="w-7 h-7 md:w-9 md:h-9 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
