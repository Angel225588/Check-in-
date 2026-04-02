"use client";
import { useState, useEffect } from "react";

export default function DebugPage() {
  const [info, setInfo] = useState<{ key: string; size: string }[]>([]);
  const [totalSize, setTotalSize] = useState("0");
  const [dailyKeys, setDailyKeys] = useState<string[]>([]);

  useEffect(() => {
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
    setTotalSize(total > 1024 * 1024 ? `${(total / 1024 / 1024).toFixed(2)} MB` : `${(total / 1024).toFixed(1)} KB`);
    setDailyKeys(daily);
  }, []);

  return (
    <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F] p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-dark mb-1">Storage Debug</h1>
      <p className="text-sm text-muted mb-4">Total: {totalSize} / 5 MB</p>

      {dailyKeys.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
          <p className="text-sm font-bold text-green-700 dark:text-green-400">
            Active daily data found:
          </p>
          {dailyKeys.map((k) => (
            <p key={k} className="text-xs text-green-600 dark:text-green-300 mt-1">{k}</p>
          ))}
        </div>
      )}

      {dailyKeys.length === 0 && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm font-bold text-red-600 dark:text-red-400">
            No active dailyData keys found — previous data was cleared.
          </p>
        </div>
      )}

      <div className="space-y-1">
        {info.map(({ key, size }) => (
          <div key={key} className="flex justify-between items-center p-2 rounded-lg glass-liquid">
            <span className="text-xs font-mono text-dark truncate mr-2">{key}</span>
            <span className="text-xs font-bold text-muted shrink-0">{size}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => window.history.back()}
        className="mt-6 w-full py-3 rounded-full bg-brand text-white font-bold text-sm active:scale-[0.97] transition-all"
      >
        Back
      </button>
    </div>
  );
}
