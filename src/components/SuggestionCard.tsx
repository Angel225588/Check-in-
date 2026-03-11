"use client";
import { Client, CheckInRecord } from "@/lib/types";
import { getRemainingForRoom, isComp } from "@/lib/utils";
import { findGuest, getGuestBadge, BADGE_CONFIG } from "@/lib/guests";
import { useApp } from "@/contexts/AppContext";

interface SuggestionCardProps {
  client: Client;
  checkIns: CheckInRecord[];
  onSelect: (roomNumber: string, clientIndex?: number) => void;
  clientIndex?: number;
}

export default function SuggestionCard({
  client,
  checkIns,
  onSelect,
  clientIndex,
}: SuggestionCardProps) {
  const { t, lang } = useApp();
  const remaining = getRemainingForRoom(client, checkIns);
  const total = client.adults + client.children;
  const allCheckedIn = remaining === 0;
  const comp = isComp(client);
  const guest = findGuest(client.name);
  const badge = guest ? getGuestBadge(guest.visitCount) : null;
  const badgeConf = badge ? BADGE_CONFIG[badge] : null;

  return (
    <button
      onClick={() => onSelect(client.roomNumber, clientIndex)}
      className={`w-full text-left p-4 md:p-5 rounded-[14px] flex items-center gap-4 transition-all active:scale-[0.98] ${
        allCheckedIn
          ? "opacity-50 bg-green-50/60 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 backdrop-blur-sm"
          : "glass hover:bg-white/80 dark:hover:bg-white/8"
      }`}
    >
      <div
        className={`w-1.5 h-12 md:h-14 rounded-full ${
          client.isVip ? "bg-brand-light" : comp ? "bg-purple-500" : "bg-teal"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl md:text-3xl font-bold font-mono text-dark">
            {client.roomNumber}
          </span>
          {client.isVip && (
            <span className="text-sm md:text-base bg-gradient-to-r from-brand to-brand-light text-white px-3 py-1 rounded-full font-black shadow-sm shadow-brand/20 tracking-wide">
              VIP{client.vipLevel ? ` ${client.vipLevel}` : ""}
            </span>
          )}
          {comp && (
            <span className="text-sm md:text-base bg-purple-600 text-white px-3 py-1 rounded-full font-black shadow-sm shadow-purple-500/20 tracking-wide">
              COMP
            </span>
          )}
          {allCheckedIn && (
            <span className="text-xs md:text-sm bg-green-100/70 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium backdrop-blur-sm">
              DONE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm md:text-base text-muted truncate">{client.name}</span>
          {badgeConf && badge !== "new" && (
            <span className={`text-[9px] md:text-[10px] ${badgeConf.color} ${badgeConf.bg} px-1.5 py-0.5 rounded-full font-bold shrink-0`}>
              {lang === "fr" ? badgeConf.labelFr : badgeConf.label}
              {guest && guest.visitCount > 1 ? ` ×${guest.visitCount}` : ""}
            </span>
          )}
          {guest?.birthday && (() => {
            const today = new Date();
            const [m, d] = guest.birthday!.split("-").map(Number);
            if (today.getMonth() + 1 === m && today.getDate() === d) {
              return <span className="text-sm shrink-0">🎂</span>;
            }
            return null;
          })()}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg md:text-xl font-bold text-dark">
          {remaining}/{total}
        </div>
        <div className="text-xs md:text-sm text-muted">{t("card.remaining")}</div>
      </div>
    </button>
  );
}
