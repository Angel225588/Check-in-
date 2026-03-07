"use client";

interface SearchInputProps {
  query: string;
  mode: "numeric" | "alpha";
  onClear: () => void;
}

export default function SearchInput({ query, mode, onClear }: SearchInputProps) {
  return (
    <div className="relative">
      <div className="flex items-center bg-white rounded-xl shadow-sm border px-4 py-3">
        <svg
          className="w-5 h-5 text-gray-400 mr-3 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-xl flex-1">
          {query || (
            <span className="text-gray-400">
              {mode === "numeric"
                ? "Type room number..."
                : "Type guest name..."}
            </span>
          )}
        </span>
        {query && (
          <button
            onClick={onClear}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
