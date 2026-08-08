"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DotsThree, Flask, TrashSimple, Bug, X } from "@phosphor-icons/react/dist/ssr";
import { seedMockData, wipeMockData } from "@/lib/mock-seeder";

/**
 * The way back into the test tools once the app is installed.
 *
 * Installed to the home screen there is no address bar, so /debug becomes
 * unreachable — you cannot type a URL into a screen that has none. This is the
 * door: quiet enough that a receptionist reads it as an overflow menu, one tap
 * away for whoever is testing.
 *
 * Seeding replaces today's service outright, so it asks first. Nothing here
 * touches a real day without a confirmation.
 */
export default function TestDataSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");

  const seed = () => {
    if (!confirm("Charger un service de démonstration ? Les données du jour seront remplacées.")) return;
    const r = seedMockData();
    setFlash(`${r.clientsToday} chambres · ${r.sessions} jours d'historique`);
    setTimeout(() => { setOpen(false); router.push("/search"); }, 700);
  };

  const wipe = () => {
    if (!confirm("Effacer toutes les données locales ? Cette action est définitive.")) return;
    const n = wipeMockData();
    setFlash(`${n} clés effacées`);
  };

  const row =
    "w-full min-h-[56px] px-4 rounded-[16px] flex items-center gap-3 glass-liquid text-left active:scale-[0.98] transition-transform";
  const rowLabel = "text-[15px] font-bold";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Outils de test"
        data-role="test-tools"
        className="p-2 glass-liquid rounded-full active:scale-95 transition-transform"
      >
        <DotsThree size={20} weight="bold" style={{ color: "var(--tab-idle)" }} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center screen-safe" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/60" />
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-4 pb-8 flex flex-col gap-2 animate-[slideUp_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-dark">Outils de test</h3>
              <button onClick={() => setOpen(false)} aria-label="Fermer" className="p-2 glass-liquid rounded-full">
                <X size={16} weight="bold" />
              </button>
            </div>

            <button onClick={seed} className={row} data-role="seed-demo">
              <Flask size={20} weight="fill" style={{ color: "var(--brand-ink)" }} />
              <span className="min-w-0">
                <span className={`${rowLabel} block text-dark`}>Charger un service de démo</span>
                <span className="block text-[12.5px] text-muted">Chambres, arrivées et historique fictifs</span>
              </span>
            </button>

            <button onClick={() => router.push("/debug")} className={row}>
              <Bug size={20} weight="duotone" style={{ color: "var(--tab-idle)" }} />
              <span className={`${rowLabel} text-dark`}>Ouvrir le débogueur</span>
            </button>

            <button onClick={wipe} className={row} data-role="wipe-demo">
              <TrashSimple size={20} weight="duotone" style={{ color: "var(--aur-bad-ink)" }} />
              <span className={`${rowLabel}`} style={{ color: "var(--aur-bad-ink)" }}>
                Effacer toutes les données locales
              </span>
            </button>

            {flash && (
              <div className="mt-2 text-[13px] font-bold text-center" style={{ color: "var(--aur-good-ink)" }}>
                {flash}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
