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
    <div className="bg-gray-100 rounded-xl p-2 space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyPress(key.toLowerCase())}
              className="bg-white rounded-lg px-2.5 py-3 text-base font-bold shadow-sm active:bg-gray-200 transition-colors min-w-[28px]"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2">
        <button
          onClick={onToggleMode}
          className="bg-gray-300 rounded-lg px-4 py-3 text-sm font-bold active:bg-gray-400 transition-colors"
        >
          123
        </button>
        <button
          onClick={() => onKeyPress(" ")}
          className="bg-white rounded-lg px-12 py-3 text-sm font-bold shadow-sm active:bg-gray-200 transition-colors flex-1"
        >
          space
        </button>
        <button
          onClick={onBackspace}
          className="bg-gray-300 rounded-lg px-4 py-3 text-xl active:bg-gray-400 transition-colors"
        >
          <svg
            className="w-6 h-6 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0v14H10L3 12z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
