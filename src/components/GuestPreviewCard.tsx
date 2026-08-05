"use client";
import { Warning, Star, Coffee, Prohibit, PushPin, AirplaneLanding, AirplaneTakeoff } from "@phosphor-icons/react/dist/ssr";
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
/**
 * "27/07/26" → "27/07". Anything that is not day/month/year is passed through
 * untouched: the report is OCR'd, and a date we cannot parse is still a date
 * reception can read.
 */
function shortDate(d: string): string {
  const m = d.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}$/);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}` : d;
}

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
      /* surface-card, not a hand-rolled fill. The old non-VIP style was a 7%
         white gradient with an 8% white ring — invisible on a cream page,
         because it had only ever been looked at in the dark theme. The card
         now uses the same tier as every other card in the app and is a card in
         both themes. */
      className={`relative flex-1 min-h-[150px] portrait:min-h-[110px] rounded-[24px] px-5 pt-4 pb-6 flex flex-col overflow-hidden ${vip ? "" : "surface-card"}`}
      style={vip
        ? { background: "linear-gradient(135deg,#8E520C,#9A6212 48%,#7E480C)", boxShadow: "0 16px 44px -14px rgba(120,74,12,.55)" }
        : undefined}
    >
      {/* Portrait centres the stack instead of pinning it to the top. The card
          owns the whole slot there (Option B), and a key card with its content
          shoved against the ceiling and 200px of nothing under it reads as a
          layout that ran out of things to say. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-0.5 portrait:justify-center">
      {/* The eyebrow alone. The visits badge moved down to the chip row with
          the rest of what is true about this stay, which frees the top-right
          corner for the compose action — the one control on this card. */}
      <div className="shrink-0 flex items-start justify-between gap-3">
        <span className="text-[10.5px] font-black uppercase tracking-[0.15em]"
          style={{ color: vip ? "rgba(255,255,255,.9)" : "var(--tab-idle)" }}>
          Chambre
        </span>
      </div>

      <div
        /* Two clamps, because the scarce axis flips with the orientation.
           Landscape is short and wide, so the number is held down by height;
           portrait is tall and narrow, so 4.6vw would pin it to the 34px floor
           on a phone — the exact squeeze Option B exists to avoid. */
        className="shrink-0 flex font-black leading-[0.88] tracking-[-0.045em] tabular-nums text-[clamp(34px,min(4.6vw,7.4vh),66px)] portrait:text-[clamp(44px,min(15vw,9vh),92px)]"
        style={{ color: vip ? "#fff" : undefined }}
      >
        {client.roomNumber.split("").map((d, i) => (
          <span key={i} className="inline-block animate-[rollIn_.3s_cubic-bezier(.2,.9,.25,1)_backwards]"
            style={{ animationDelay: `${i * 55}ms` }}>{d}</span>
        ))}
      </div>

      <div data-role="preview-name" className="shrink-0 text-[24px] portrait:text-[clamp(24px,6.4vw,34px)] font-black leading-tight truncate" style={{ color: vip ? "#fff" : undefined }}>
        {client.name}
      </div>

      {shown.length > 0 && (
        <div className="shrink-0 flex flex-col gap-1 mt-1" data-role="preview-notes">
          {shown.map((n) => {
            const alert = n.tone === "alert";
            return (
              <span
                key={n.id}
                data-role="preview-note"
                data-note-tone={n.tone}
                className="flex items-center gap-1.5 text-[12.5px] font-bold px-2 py-1 rounded-[12px] truncate"
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

      <div className={`flex items-center gap-2 flex-wrap mt-auto portrait:mt-3 pt-2 min-h-0 overflow-hidden ${shown.length > 0 ? "[@media(max-height:720px)]:hidden" : ""}`}>
        <b className="text-[16px]" style={{ color: vip ? "rgba(255,255,255,.92)" : "var(--tab-idle)" }}>
          {pax} pers.
        </b>
        {/* A sixteenth stay is the single most useful thing on this card and it
            was wearing the same glass as everything else. Gold, so "this one
            comes back" reads before the words do. */}
        <span
          data-role="preview-visits"
          className="inline-flex items-center gap-1.5 text-[13px] font-black px-3 py-1.5 rounded-full"
          style={vip
            ? { background: "rgba(0,0,0,.34)", color: "#fff", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22)" }
            : visits > 0
              ? { background: "var(--aur-gold-soft-2)", color: "var(--brand-ink)", boxShadow: "inset 0 0 0 1px var(--aur-gold)" }
              : glass}
        >
          {visits > 0 ? `Habitué · ${visits}ᵉ` : "1ʳᵉ visite"}
        </span>
        {/* The stay, in the same landing/takeoff shorthand the check-in card
            already uses. Reception asks "vous partez quand ?" every morning;
            it was on the room's own screen but not on the card you decide
            from. The year is dropped — nobody is checking in for 2027. */}
        {(client.arrivalDate || client.departureDate) && (
          <span
            data-role="preview-stay"
            className="inline-flex items-center gap-1.5 text-[13px] font-black px-3 py-1.5 rounded-full tabular-nums"
            style={glass}
          >
            {client.arrivalDate && (
              <>
                <AirplaneLanding weight="duotone" size={15} />
                {shortDate(client.arrivalDate)}
              </>
            )}
            {client.departureDate && (
              <>
                <AirplaneTakeoff weight="duotone" size={15} className={client.arrivalDate ? "ml-1" : ""} />
                {shortDate(client.departureDate)}
              </>
            )}
          </span>
        )}
        {needsPay && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-black px-3 py-1.5 rounded-full"
            style={hasAlert || vip ? glass : { background: "var(--aur-bad-soft)", color: "var(--aur-bad-ink)" }}>
            <Coffee weight="duotone" size={15} /><Prohibit weight="bold" size={12} /> À ENCAISSER
          </span>
        )}
        {comp && (
          <span className="text-[13px] font-black px-3 py-1.5 rounded-full"
            style={hasAlert || vip ? glass : { background: "rgba(90,59,143,.16)", color: "var(--aur-pm-points)" }}>
            COMP
          </span>
        )}
        {vip && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-black px-3 py-1.5 rounded-full" style={glass}>
            <Star weight="fill" size={14} /> {client.vipLevel || "VIP"}
          </span>
        )}
      </div>

      </div>

      <style jsx>{`
        @keyframes rollIn { from { opacity: 0; transform: translateY(.34em) scale(.86) } to { opacity: 1; transform: none } }
      `}</style>
    </div>
  );
}
