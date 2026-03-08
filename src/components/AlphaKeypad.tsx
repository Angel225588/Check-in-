"use client";

interface AlphaKeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onToggleMode: () => void;
}

export default function AlphaKeypad({
  onKeyPress,
  onBackspace,
  onToggleMode,
}: AlphaKeypadProps) {
  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  return (
    <div className="glass-surface rounded-[14px] p-2 md:p-3 space-y-1.5 md:space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1 md:gap-1.5">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyPress(key.toLowerCase())}
              className="glass-key rounded-lg px-2.5 md:px-4 py-3 md:py-4 text-base md:text-xl font-bold active:scale-90 active:bg-white/60 dark:active:bg-white/10 transition-all min-w-[28px] md:min-w-[40px]"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2 md:gap-3">
        <button
          onClick={onToggleMode}
          className="bg-teal/90 backdrop-blur-sm text-white rounded-xl px-4 md:px-6 py-3 md:py-4 text-sm md:text-lg font-bold active:scale-95 active:opacity-80 transition-all"
        >
          123
        </button>
        <button
          onClick={() => onKeyPress(" ")}
          className="glass-key rounded-xl px-12 py-3 md:py-4 text-sm md:text-base font-bold active:scale-95 active:bg-white/60 dark:active:bg-white/10 transition-all flex-1"
        >
          space
        </button>
        <button
          onClick={onBackspace}
          className="bg-slate/90 backdrop-blur-sm text-white rounded-xl px-4 md:px-6 py-3 md:py-4 text-xl active:scale-95 active:opacity-80 transition-all"
        >
          <svg className="w-6 h-6 md:w-8 md:h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
