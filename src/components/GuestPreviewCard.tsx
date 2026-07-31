"use client";
import { Warning, Star, Coffee, Prohibit, PushPin } from "@phosphor-icons/react/dist/ssr";
import { Client } from "@/lib/types";
import { isComp, needsPaymentChoice } from "@/lib/utils";
import type { GuestNote } from "@/lib/notes";

/**
 * The right column while searching: the same box the clock occupies, turned
 * into a key card for the guest you just resolved.
 *
 * Hierarchy, in order of what has to survive a two-metre glance:
 *   1. the room number      — nothing on the card competes with it
 *   2. the name             — readable across a counter
 *   3. anything flagged     — an allergy sits directly under the name
 *   4. pax and package      — quiet chips
 *
 * One coloured thing at a time: when a note is flagged, the payment and status
 * chips step back to glass so the alert is the only thing shouting. The box
 * keeps its size in every state so nothing under it jumps.
 */
export default function GuestPreviewCard({
  client,
  visits,
  notes = [],
}: {
  client: Client;
  visits: number;
  notes?: GuestNote[];
}) {
  const pax = client.adults + client.children;
  const comp = isComp(client);
  const needsPay = needsPaymentChoice(client);
  const vip = !!client.isVip;

  // Alerts first, then anything pinned. Two lines maximum: a card that lists
  // six notes has stopped being a glance.
  const flagged = [
    ...notes.filter((n) => n.tone === "alert"),
    ...notes.filter((n) => n.tone !== "alert" && n.pinned),
  ];
  const shown = flagged.slice(0, 2);
  const overflow = flagged.length - shown.length;
  const hasAlert = shown.some((n) => n.tone === "alert");

  /* Glass, not paint: the chips read as material rather than as status, which
     leaves colour free for the one thing that needs it. */
  const glass = vip
    ? { background: "rgba(0,0,0,.30)", color: "#fff", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }
    : {
        background: "linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04))",
        color: "var(--aur-ink-2)",
        boxShadow: "inset 0 0 0 1px var(--aur-hairline)",
        backdropFilter: "blur(6px)",
      };

  return (
    <div
      data-role="guest-preview"
      className="relative flex-1 min-h-[150px] rounded-[24px] px-5 py-4 flex flex-col justify-center gap-0.5 overflow-hidden"
      style={vip
        ? { background: "linear-gradient(135deg,#8E520C,#9A6212 48%,#7E480C)", boxShadow: "0 16px 44px -14px rgba(120,74,12,.55)" }
        : { background: "linear-gradient(158deg,rgba(255,255,255,.07),rgba(255,255,255,.02))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10.5px] font-black uppercase tracking-[0.15em]"
          style={{ color: vip ? "rgba(255,255,255,.9)" : "var(--tab-idle)" }}>
          Chambre
        </span>
        <span className="shrink-0 text-[11px] font-black px-2 py-1 rounded-full" style={glass}>
          {visits > 0 ? `Habitué · ${visits}ᵉ séjour` : "1ʳᵉ visite"}
        </span>
      </div>

      <div
        className="flex text-[clamp(38px,4.6vw,66px)] font-black leading-[0.88] tracking-[-0.045em] tabular-nums"
        style={{ color: vip ? "#fff" : undefined }}
      >
        {client.roomNumber.split("").map((d, i) => (
          <span key={i} className="inline-block animate-[rollIn_.3s_cubic-bezier(.2,.9,.25,1)_backwards]"
            style={{ animationDelay: `${i * 55}ms` }}>{d}</span>
        ))}
      </div>

      <div className="text-[20px] font-bold leading-tight truncate" style={{ color: vip ? "#fff" : undefined }}>
        {client.name}
      </div>

      {shown.length > 0 && (
        <div className="flex flex-col gap-1 mt-1.5" data-role="preview-notes">
          {shown.map((n) => {
            const alert = n.tone === "alert";
            return (
              <span
                key={n.id}
                data-role="preview-note"
                data-note-tone={n.tone}
                className="flex items-center gap-1.5 text-[12.5px] font-bold px-2 py-1.5 rounded-[12px] truncate"
                style={alert
                  ? {
                      background: vip ? "rgba(0,0,0,.34)" : "var(--aur-bad-soft)",
                      color: vip ? "#fff" : "var(--aur-bad-ink)",
                      boxShadow: `inset 0 0 0 1px ${vip ? "rgba(255,255,255,.22)" : "var(--aur-bad-ink)"}`,
                    }
                  : glass}
              >
                {alert
                  ? <Warning weight="duotone" size={14} className="shrink-0" />
                  : <PushPin weight="fill" size={12} className="shrink-0" />}
                <span className="truncate">{n.title || n.body}</span>
              </span>
            );
          })}
          {overflow > 0 && (
            <span className="text-[11px] font-black" style={{ color: vip ? "rgba(255,255,255,.85)" : "var(--tab-idle)" }}>
              +{overflow} autre{overflow > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mt-2 min-h-0">
        <b className="text-[14px]" style={{ color: vip ? "rgba(255,255,255,.92)" : "var(--tab-idle)" }}>
          {pax} pers.
        </b>
        {needsPay && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={hasAlert || vip ? glass : { background: "var(--aur-bad-soft)", color: "var(--aur-bad-ink)" }}>
            <Coffee weight="duotone" size={13} /><Prohibit weight="bold" size={11} /> À ENCAISSER
          </span>
        )}
        {comp && (
          <span className="text-[11.5px] font-black px-3 py-1.5 rounded-full"
            style={hasAlert || vip ? glass : { background: "rgba(90,59,143,.16)", color: "var(--aur-pm-points)" }}>
            COMP
          </span>
        )}
        {vip && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-black px-3 py-1.5 rounded-full" style={glass}>
            <Star weight="fill" size={12} /> {client.vipLevel || "VIP"}
          </span>
        )}
      </div>

      <style jsx>{`
        @keyframes rollIn { from { opacity: 0; transform: translateY(.34em) scale(.86) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
