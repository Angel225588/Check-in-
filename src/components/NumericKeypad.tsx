"use client";

interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

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

  return (
    <div className="glass-surface rounded-[14px] p-1.5 md:p-2.5 space-y-1.5 md:space-y-2" role="group" aria-label="Numeric keypad" style={{ touchAction: "manipulation" }}>
      {keys.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-1.5 md:gap-2">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyPress(key)}
              className="glass-key rounded-xl py-3 md:py-5 text-xl md:text-3xl font-bold active:scale-95 active:bg-white/60 dark:active:bg-white/10 transition-all"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-1.5 md:gap-2">
        <button
          onClick={onToggleMode}
          className="bg-teal/90 backdrop-blur-sm text-white rounded-xl py-3 md:py-5 text-sm md:text-lg font-bold active:scale-95 active:opacity-80 transition-all"
        >
          ABC
        </button>
        <button
          onClick={() => onKeyPress("0")}
          className="glass-key rounded-xl py-3 md:py-5 text-xl md:text-3xl font-bold active:scale-95 active:bg-white/60 dark:active:bg-white/10 transition-all"
        >
          0
        </button>
        <button
          onClick={onBackspace}
          aria-label="Backspace"
          className="bg-slate/90 backdrop-blur-sm text-white rounded-xl py-3 md:py-5 text-xl active:scale-95 active:opacity-80 transition-all"
        >
          <svg className="w-6 h-6 md:w-8 md:h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
