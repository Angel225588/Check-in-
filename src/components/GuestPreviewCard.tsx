"use client";
import { Warning, Star, Coffee, Prohibit } from "@phosphor-icons/react/dist/ssr";
import { Client } from "@/lib/types";
import { isComp, needsPaymentChoice } from "@/lib/utils";

/**
 * The right column while searching: the same box the clock occupies, turned
 * into a key card for the guest you just resolved.
 *
 * It answers the three things reception needs before committing — who, how
 * many, and anything that changes what happens next — without leaving the
 * keypad or loading another screen.
 */
export default function GuestPreviewCard({
  client,
  visits,
}: {
  client: Client;
  visits: number;
}) {
  const pax = client.adults + client.children;
  const comp = isComp(client);
  const needsPay = needsPaymentChoice(client);
  const vip = !!client.isVip;

  return (
    <div
      data-role="guest-preview"
      className="relative flex-1 min-h-[150px] rounded-[24px] px-5 py-4 flex flex-col justify-center gap-0.5 overflow-hidden animate-[cardIn_.3s_cubic-bezier(.2,.9,.25,1)]"
      style={vip
        ? { background: "linear-gradient(135deg,#8E520C,#9A6212 48%,#7E480C)", boxShadow: "0 16px 44px -14px rgba(120,74,12,.55)" }
        : { background: "linear-gradient(158deg,rgba(255,255,255,.07),rgba(255,255,255,.02))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10.5px] font-black uppercase tracking-[0.15em]"
          style={{ color: vip ? "rgba(255,255,255,.9)" : "var(--tab-idle)" }}>
          Chambre
        </span>
        <span
          className="shrink-0 text-[11px] font-black px-2.5 py-1 rounded-full"
          style={vip
            ? { background: "rgba(0,0,0,.34)", color: "#fff" }
            : visits > 0
              ? { background: "rgba(47,111,79,.20)", color: "var(--aur-good-ink)" }
              : { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)" }}
        >
          {visits > 0 ? `Habitué · ${visits}ᵉ séjour` : "1ʳᵉ visite"}
        </span>
      </div>

      <div
        className="flex text-[clamp(40px,5vw,70px)] font-black leading-[0.88] tracking-[-0.045em] tabular-nums"
        style={{ color: vip ? "#fff" : undefined }}
      >
        {client.roomNumber.split("").map((d, i) => (
          <span key={i} className="inline-block animate-[rollIn_.3s_cubic-bezier(.2,.9,.25,1)_backwards]"
            style={{ animationDelay: `${i * 55}ms` }}>{d}</span>
        ))}
      </div>

      <div className="text-[21px] font-bold leading-tight truncate" style={{ color: vip ? "#fff" : undefined }}>
        {client.name}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2 min-h-0">
        <b className="text-[14px]" style={{ color: vip ? "rgba(255,255,255,.92)" : "var(--tab-idle)" }}>
          {pax} pers.
        </b>
        {needsPay && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={vip ? { background: "rgba(0,0,0,.34)", color: "#fff" } : { background: "var(--aur-bad-soft)", color: "var(--aur-bad-ink)" }}>
            <Coffee weight="duotone" size={13} /><Prohibit weight="bold" size={11} /> À ENCAISSER
          </span>
        )}
        {comp && (
          <span className="text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={vip ? { background: "rgba(0,0,0,.34)", color: "#fff" } : { background: "rgba(90,59,143,.16)", color: "var(--aur-pm-points)" }}>
            COMP
          </span>
        )}
        {vip && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={{ background: "rgba(0,0,0,.34)", color: "#fff" }}>
            <Star weight="fill" size={12} /> {client.vipLevel || "VIP"}
          </span>
        )}
        {client.pendingPaymentAction === "alert" && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={{ background: "var(--aur-bad-soft)", color: "var(--aur-bad-ink)" }}>
            <Warning weight="duotone" size={13} /> ALERTE
          </span>
        )}
      </div>

      <style jsx>{`
        @keyframes cardIn { from { opacity: 0; transform: translateY(9px) scale(.985) } to { opacity: 1; transform: none } }
        @keyframes rollIn { from { opacity: 0; transform: translateY(.34em) scale(.86) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
