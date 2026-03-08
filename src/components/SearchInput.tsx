"use client";
import { useApp } from "@/contexts/AppContext";

interface SearchInputProps {
  query: string;
  mode: "numeric" | "alpha";
  onClear: () => void;
}

export default function SearchInput({ query, mode, onClear }: SearchInputProps) {
  const { t } = useApp();

  return (
    <div className="relative">
      <div className="flex items-center glass rounded-[14px] px-4 py-3 md:px-5 md:py-4">
        <svg className="w-5 h-5 md:w-6 md:h-6 text-muted mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-xl md:text-2xl flex-1 text-dark">
          {query || (
            <span className="text-muted">
              {mode === "numeric" ? t("search.roomPlaceholder") : t("search.namePlaceholder")}
            </span>
          )}
        </span>
        {query && (
          <button onClick={onClear} className="ml-2 text-muted hover:text-dark active:scale-90 transition-transform">
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
