"use client";
import {
  Cake,
  Heart,
  Sparkle,
  Star,
  Crown,
  WarningCircle,
  Info,
} from "@phosphor-icons/react/dist/ssr";
import { RoomEvent } from "@/lib/room-events";
import { cn } from "@/lib/utils";

const ICON_BY_NAME = {
  Cake,
  Heart,
  Sparkle,
  Star,
  Crown,
  WarningCircle,
  Info,
} as const;

type IconName = keyof typeof ICON_BY_NAME;

interface Props {
  events: RoomEvent[];
  variant?: "inline" | "stack";
  showReason?: boolean;
  className?: string;
}

const TYPE_LABEL: Record<string, string> = {
  anniversaire: "Anniversaire",
  honeymoon: "Honeymoon",
  "anniversary-stay": "Demande mariage",
  ambassador: "AMBASSADEUR",
  "top-vip": "Top VIP",
  complaint: "Plainte",
  other: "Note",
};

/**
 * Renders the icons + (optional) reason text for the morning-brief events
 * that touch a single room. Use:
 *  - variant="inline" + showReason=false  → small badges next to a name
 *  - variant="stack"  + showReason=true   → full badge list with reason
 *
 * Ambassador is rendered as a prominent gold pill ("AMBASSADEUR" label)
 * in both modes — these are the guests who spend the most time with us
 * and the team must see them at a glance.
 */
export default function RoomEventBadges({
  events,
  variant = "inline",
  showReason = false,
  className,
}: Props) {
  if (events.length === 0) return null;

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-1", className)}
        aria-label="Événements chambre"
      >
        {events.map((e, i) => {
          const Icon = ICON_BY_NAME[e.iconName as IconName] ?? Info;
          // Ambassador gets a full pill with text — must be unmissable.
          if (e.type === "ambassador") {
            return (
              <span
                key={`${e.type}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase text-white bg-gradient-to-r from-brand to-brand-light shadow-[0_0_10px_-2px] shadow-brand/60"
                title={e.reason || "Ambassadeur"}
              >
                <Star weight="fill" className="size-2.5" />
                Ambassadeur
              </span>
            );
          }
          return (
            <Icon
              key={`${e.type}-${i}`}
              weight="duotone"
              className={cn("size-3.5", e.colorClass)}
              aria-label={e.type}
            />
          );
        })}
      </span>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {events.map((e, i) => {
        const Icon = ICON_BY_NAME[e.iconName as IconName] ?? Info;
        const isAmbassador = e.type === "ambassador";

        // Ambassador stack variant — full prominent banner
        if (isAmbassador) {
          return (
            <div
              key={`${e.type}-${i}`}
              className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gradient-to-r from-brand via-brand-light to-brand text-white shadow-[0_4px_20px_-4px] shadow-brand/50"
            >
              <span className="grid place-items-center size-9 rounded-full bg-white/20 backdrop-blur-sm">
                <Star weight="fill" className="size-5 text-white drop-shadow" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-black tracking-[0.10em] uppercase drop-shadow-sm">
                    Ambassadeur
                  </span>
                  {e.status && (
                    <span className="text-[9px] uppercase font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                      {e.status === "in_house" ? "In house" : "Arriving"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/90 mt-0.5 leading-relaxed">
                  {e.reason || "Client fidèle — accueil prioritaire"}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div
            key={`${e.type}-${i}`}
            className={cn(
              "flex items-start gap-2 px-3 py-2 rounded-[10px]",
              e.bgClass
            )}
          >
            <Icon
              weight="duotone"
              className={cn("size-4 shrink-0 mt-0.5", e.colorClass)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-[11px] font-bold", e.colorClass)}>
                  {TYPE_LABEL[e.type] ?? e.type}
                </span>
                {e.status && (
                  <span className="text-[8px] uppercase font-bold text-muted">
                    {e.status === "in_house" ? "In house" : "Arriving"}
                  </span>
                )}
              </div>
              {showReason && e.reason && (
                <p className="text-[11px] text-dark/80 mt-0.5 leading-relaxed">
                  {e.reason}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
