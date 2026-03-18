"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F] px-6">
      <div className="glass-liquid rounded-[20px] p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-dark mb-1">Une erreur est survenue</h2>
        <p className="text-sm text-muted mb-6">
          {error.message || "Something went wrong. Please try again."}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20"
          >
            Réessayer
          </button>
          <button
            onClick={() => window.location.href = "/search"}
            className="w-full py-3 rounded-[52px] glass-liquid text-brand font-bold active:scale-[0.97] transition-all"
          >
            Retour au Check-in
          </button>
        </div>
      </div>
    </div>
  );
}
