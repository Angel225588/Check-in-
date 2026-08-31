"use client";

/**
 * "Last month's report is ready."
 *
 * Sits on the home screen and on the dashboard. Renders nothing at all until a
 * month is actually complete and actually has services in it — an empty card
 * announcing an empty report teaches reception to ignore the slot it lives in.
 *
 * The dot is the only thing that changes once it has been opened. The card
 * stays, because the report is worth a second look.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Receipt } from "@phosphor-icons/react";
import { getHistoricalData, getSessionHistory, getTodayData } from "@/lib/storage";
import { pendingNotice, type ValueNotice } from "@/lib/value-notice";
import type { DailyData } from "@/lib/types";
import { cn } from "@/lib/utils";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ValueReportNotice({ className }: { className?: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<ValueNotice | null>(null);

  useEffect(() => {
    const byDate = new Map<string, DailyData>();
    for (const d of getHistoricalData(400)) byDate.set(d.date, d);
    for (const s of getSessionHistory()) {
      if (!byDate.has(s.date)) {
        byDate.set(s.date, { date: s.date, clients: s.clients, checkIns: s.checkIns });
      }
    }
    const today = getTodayData();
    if (today && !byDate.has(today.date)) byDate.set(today.date, today);

    const todayIso = new Date().toISOString().split("T")[0];
    setNotice(pendingNotice(Array.from(byDate.values()), todayIso));
  }, []);

  if (!notice) return null;

  return (
    <button
      onPointerDown={() => router.push("/dashboard/value")}
      className={cn(
        "w-full glass-liquid rounded-card p-4 flex items-center gap-3 text-left",
        "hover:border-brand/40 transition-colors",
        className
      )}
    >
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-md bg-brand/10 flex items-center justify-center">
          <Receipt size={18} weight="duotone" className="text-brand" />
        </div>
        {notice.unread && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-white dark:ring-surface-dark"
            aria-label="non lu"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-dark dark:text-white">
          Rapport de valeur — <span className="capitalize">{monthLabel(notice.month)}</span>
        </div>
        <div className="text-micro text-muted">
          {notice.unread ? "Prêt à consulter" : "Déjà consulté"}
        </div>
      </div>

      <CaretRight size={14} weight="bold" className="text-muted shrink-0" />
    </button>
  );
}
