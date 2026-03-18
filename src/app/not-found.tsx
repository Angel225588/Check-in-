"use client";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F] px-6">
      <div className="glass-liquid rounded-[20px] p-8 max-w-sm w-full text-center">
        <div className="text-6xl font-black text-brand/20 mb-2">404</div>
        <h2 className="text-lg font-bold text-dark mb-1">Page introuvable</h2>
        <p className="text-sm text-muted mb-6">
          Cette page n&apos;existe pas ou a été déplacée.
        </p>
        <button
          onClick={() => window.location.href = "/search"}
          className="w-full py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20"
        >
          Retour au Check-in
        </button>
      </div>
    </div>
  );
}
