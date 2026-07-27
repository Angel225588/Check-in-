"use client";
import { Client, CheckInRecord } from "@/lib/types";
import { getRemainingForRoom, isComp, needsPaymentChoice } from "@/lib/utils";
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

  const needsPay = needsPaymentChoice(client);
  const visits = guest?.visitCount ?? 0;

  return (
    <button
      onClick={() => onSelect(client.roomNumber, clientIndex)}
      data-role="room-row"
      data-room={client.roomNumber}
      className={`w-full text-left rounded-[16px] px-4 py-3 flex items-center gap-4 min-h-[88px]
        glass-liquid active:scale-[0.995] transition-transform ${allCheckedIn ? "opacity-50" : ""}`}
    >
      <span className="text-[34px] font-black tabular-nums leading-none min-w-[86px]">
        {client.roomNumber}
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-[19.5px] font-bold truncate">{client.name}</span>
        <span className="block text-[13px] mt-0.5" style={{ color: "var(--tab-idle)" }}>
          {allCheckedIn
            ? "Tous entrés"
            : visits > 0
              ? `Habitué · ${visits}ᵉ séjour`
              : "1ʳᵉ visite"}
        </span>
      </span>

      {/* Only the states that change what reception does next carry colour. */}
      <span className="flex items-center gap-2 shrink-0">
        {comp && (
          <span className="text-[11.5px] font-black px-2.5 py-1.5 rounded-full"
            style={{ background: "rgba(90,59,143,.16)", color: "var(--aur-pm-points)", opacity: .8 }}>
            COMP
          </span>
        )}
        {client.isVip && (
          <span className="text-[11.5px] font-black px-2.5 py-1.5 rounded-full"
            style={{ background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", opacity: .85 }}>
            {client.vipLevel || "VIP"}
          </span>
        )}
        {needsPay && (
          <span className="text-[11.5px] font-black px-2.5 py-1.5 rounded-full"
            style={{ background: "var(--aur-bad-soft)", color: "var(--aur-bad)" }}>
            À ENCAISSER
          </span>
        )}
      </span>

      {/* Adults and children as their own boxes — the same shape the check-in
          screen uses, so both screens agree on what a room holds. */}
      <span className="flex gap-2 shrink-0">
        {[
          { k: "Adultes", v: client.adults },
          { k: "Enfants", v: client.children },
        ].map((b) => (
          <span key={b.k} className="min-w-[70px] text-center rounded-[13px] px-2.5 py-1.5"
            style={{ background: "rgba(255,255,255,.04)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)" }}>
            <span className="block text-[9.5px] font-black uppercase tracking-[0.10em]"
              style={{ color: "var(--tab-idle)" }}>{b.k}</span>
            <span className="block text-[21px] font-bold tabular-nums leading-tight"
              style={{ color: b.v ? undefined : "var(--tab-idle)" }}>{b.v}</span>
          </span>
        ))}
      </span>
    </button>
  );
}
