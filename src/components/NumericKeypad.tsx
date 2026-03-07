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
    <div className="bg-gray-100 rounded-xl p-1.5 space-y-1.5">
      {keys.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-1.5">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => onKeyPress(key)}
              className="bg-white rounded-lg py-3 text-xl font-bold shadow-sm active:bg-gray-200 transition-colors"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={onToggleMode}
          className="bg-gray-300 rounded-lg py-3 text-sm font-bold active:bg-gray-400 transition-colors"
        >
          ABC
        </button>
        <button
          onClick={() => onKeyPress("0")}
          className="bg-white rounded-lg py-3 text-xl font-bold shadow-sm active:bg-gray-200 transition-colors"
        >
          0
        </button>
        <button
          onClick={onBackspace}
          className="bg-gray-300 rounded-lg py-3 text-xl active:bg-gray-400 transition-colors"
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
