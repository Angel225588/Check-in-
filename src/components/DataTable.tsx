"use client";
import { Client } from "@/lib/types";
import { useApp } from "@/contexts/AppContext";

interface DataTableProps {
  clients: Client[];
  onConfirm: () => void;
  onClear: () => void;
}

export default function DataTable({
  clients,
  onConfirm,
  onClear,
}: DataTableProps) {
  const { t } = useApp();

  if (clients.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark">
          {t("table.review")} ({clients.length} {t("upload.rooms")})
        </h3>
        <button onClick={onClear} className="text-sm text-error underline">
          {t("upload.clear")}
        </button>
      </div>
      <div className="overflow-x-auto glass rounded-[14px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 dark:border-white/5">
              <th className="px-3 py-2 text-left text-muted font-medium">{t("table.room")}</th>
              <th className="px-3 py-2 text-left text-muted font-medium">{t("table.name")}</th>
              <th className="px-3 py-2 text-center text-muted font-medium">Adl</th>
              <th className="px-3 py-2 text-center text-muted font-medium">Chl</th>
              <th className="px-3 py-2 text-left text-muted font-medium">{t("table.pkg")}</th>
              <th className="px-3 py-2 text-left text-muted font-medium">{t("checkin.arrival")}</th>
              <th className="px-3 py-2 text-left text-muted font-medium">{t("checkin.departure")}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={i} className={`border-t border-black/5 dark:border-white/5 ${c.isVip ? "bg-brand-50" : ""}`}>
                <td className="px-3 py-2 font-mono font-bold text-dark">
                  <span className="flex items-center gap-1.5">
                    {c.roomNumber}
                    {c.isVip && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-light text-dark">
                        VIP{c.vipLevel ? ` ${c.vipLevel}` : ""}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-dark">{c.name}</td>
                <td className="px-3 py-2 text-center text-dark">{c.adults}</td>
                <td className="px-3 py-2 text-center text-dark">{c.children}</td>
                <td className="px-3 py-2 text-xs text-muted">{c.packageCode}</td>
                <td className="px-3 py-2 text-xs text-muted">{c.arrivalDate}</td>
                <td className="px-3 py-2 text-xs text-muted">{c.departureDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={onConfirm}
        className="w-full bg-brand text-white py-4 rounded-[52px] text-xl font-bold active:opacity-90 transition-opacity dark:glow-brand"
      >
        {t("table.confirm")} ({clients.length} {t("upload.rooms")})
      </button>
    </div>
  );
}
