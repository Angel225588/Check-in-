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

/**
 * Renders the icons + (optional) reason text for the morning-brief events
 * that touch a single room. Use:
 *  - variant="inline" + showReason=false  → small badges next to a name
 *  - variant="stack"  + showReason=true   → full badge list with reason
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
                <span className={cn("text-[11px] font-bold capitalize", e.colorClass)}>
                  {e.type === "top-vip"
                    ? "Top VIP"
                    : e.type.replace(/-/g, " ")}
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
