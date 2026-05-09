"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { seedMockData, wipeMockData } from "@/lib/mock-seeder";
import { getSettings, saveSettings } from "@/lib/storage";

export default function DebugPage() {
  const router = useRouter();
  const [info, setInfo] = useState<{ key: string; size: string }[]>([]);
  const [totalSize, setTotalSize] = useState("0");
  const [dailyKeys, setDailyKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState<"seed" | "wipe" | null>(null);
  const [flash, setFlash] = useState<string>("");
  const [localOCR, setLocalOCR] = useState(false);

  const refresh = () => {
    const entries: { key: string; size: string }[] = [];
    let total = 0;
    const daily: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key) || "";
      const bytes = new Blob([val]).size;
      total += bytes;
      entries.push({
        key,
        size: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`,
      });
      if (key.startsWith("dailyData_")) daily.push(key);
    }

    entries.sort((a, b) => {
      const sizeA = new Blob([localStorage.getItem(a.key) || ""]).size;
      const sizeB = new Blob([localStorage.getItem(b.key) || ""]).size;
      return sizeB - sizeA;
    });

    setInfo(entries);
    setTotalSize(
      total > 1024 * 1024
        ? `${(total / 1024 / 1024).toFixed(2)} MB`
        : `${(total / 1024).toFixed(1)} KB`
    );
    setDailyKeys(daily);
  };

  useEffect(() => {
    refresh();
    setLocalOCR(!!getSettings().localOCR);
  }, []);

  const handleLocalOCRToggle = () => {
    const next = !localOCR;
    setLocalOCR(next);
    const current = getSettings();
    saveSettings({ ...current, localOCR: next });
  };

  const handleSeed = async () => {
    setBusy("seed");
    setFlash("");
    setTimeout(() => {
      const result = seedMockData();
      setFlash(
        `✅ ${result.sessions} sessions historiques + ${result.clientsToday} clients aujourd'hui injectés.`
      );
      setBusy(null);
      refresh();
    }, 100);
  };

  const handleWipe = () => {
    setBusy("wipe");
    setFlash("");
    setTimeout(() => {
      const deleted = wipeMockData();
      setFlash(`🧹 ${deleted} clés supprimées.`);
      setBusy(null);
      refresh();
    }, 100);
  };

  return (
    <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-dark mb-1">Storage Debug</h1>
      <p className="text-sm text-muted mb-4">Total: {totalSize} / 5 MB</p>

      {/* OCR Mode toggle */}
      <div className="mb-4 p-4 rounded-[14px] glass-liquid border border-brand/20">
        <h2 className="text-sm font-bold text-dark mb-2">🔒 OCR Mode</h2>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Mode <b>Local</b> = Tesseract en local, aucune donnée envoyée à
          Google. Plus lent (10-15s) mais 100% confidentiel. Mode par défaut
          en V2 / contrat signé.
        </p>
        <button
          onClick={handleLocalOCRToggle}
          className={`w-full py-2.5 rounded-full font-bold text-sm active:scale-[0.97] transition-all ${
            localOCR
              ? "bg-green-500 text-white"
              : "bg-brand/15 text-brand"
          }`}
        >
          {localOCR ? "✅ Mode Local actif (Tesseract)" : "⚡ Mode AI actif (Gemini)"}
        </button>
      </div>

      {/* Mock data controls */}
      <div className="mb-4 p-4 rounded-[14px] glass-liquid border border-brand/20">
        <h2 className="text-sm font-bold text-dark mb-2">🧪 Mock Data</h2>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Inject 7 days of realistic test data: ~100 rooms, 12 VIPs, 3 off-list
          VIPs, 5 walk-ins, peak 8h-9h, 78% attendance, mixed payment modes.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleSeed}
            disabled={!!busy}
            className="flex-1 py-2.5 rounded-full bg-brand text-white font-bold text-sm active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {busy === "seed" ? "Seeding…" : "🌱 Seed Mock Data"}
          </button>
          <button
            onClick={handleWipe}
            disabled={!!busy}
            className="flex-1 py-2.5 rounded-full bg-red-500/90 text-white font-bold text-sm active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {busy === "wipe" ? "Wiping…" : "🧹 Clear All"}
          </button>
        </div>
        {flash && (
          <p className="text-xs text-dark mt-3 text-center font-medium">{flash}</p>
        )}
      </div>

      {dailyKeys.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
          <p className="text-sm font-bold text-green-700 dark:text-green-400">
            Active daily data found:
          </p>
          {dailyKeys.map((k) => (
            <p key={k} className="text-xs text-green-600 dark:text-green-300 mt-1">
              {k}
            </p>
          ))}
        </div>
      )}

      {dailyKeys.length === 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
            No active dailyData keys — empty state ou en attente d'upload.
          </p>
        </div>
      )}

      <div className="space-y-1">
        {info.map(({ key, size }) => (
          <div
            key={key}
            className="flex justify-between items-center p-2 rounded-lg glass-liquid"
          >
            <span className="text-xs font-mono text-dark truncate mr-2">{key}</span>
            <span className="text-xs font-bold text-muted shrink-0">{size}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          onClick={() => router.push("/dashboard")}
          className="py-3 rounded-full glass-liquid text-dark font-bold text-sm active:scale-[0.97] transition-all"
        >
          → Dashboard
        </button>
        <button
          onClick={() => router.push("/report")}
          className="py-3 rounded-full glass-liquid text-dark font-bold text-sm active:scale-[0.97] transition-all"
        >
          → Report
        </button>
      </div>

      <button
        onClick={() => window.history.back()}
        className="mt-3 w-full py-3 rounded-full bg-brand text-white font-bold text-sm active:scale-[0.97] transition-all"
      >
        Back
      </button>
    </div>
  );
}
