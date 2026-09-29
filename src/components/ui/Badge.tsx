import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { BadgeDef } from "@/lib/types";

type Tone = "cyan" | "magenta" | "neutral" | "success" | "warning";

const tones: Record<Tone, string> = {
  cyan: "border-cyan/40 bg-cyan/10 text-cyan",
  magenta: "border-magenta/40 bg-magenta/10 text-magenta",
  neutral: "border-border bg-surface-2 text-muted",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
};

/** Small pill label (categories, status, "New"). */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const tierStyles: Record<BadgeDef["tier"], string> = {
  bronze: "from-[#c98a54] to-[#6b3f1d] text-[#ffe2c7]",
  silver: "from-[#d8dde8] to-[#6d7589] text-[#f5f7ff]",
  gold: "from-[#ffd76a] to-[#a6700f] text-[#fff5d1]",
  neon: "from-cyan to-magenta text-bg",
};

/** Achievement medallion. `locked` renders a dimmed outline. */
export function AchievementBadge({ badge, locked = false }: { badge: BadgeDef; locked?: boolean }) {
  return (
    <div className="flex w-24 flex-col items-center gap-2 text-center" title={badge.description}>
      <div
        className={cn(
          "grid h-14 w-14 place-items-center rounded-full font-display text-lg font-bold",
          locked
            ? "border border-dashed border-border-strong text-subtle"
            : cn("bg-gradient-to-br shadow-card", tierStyles[badge.tier]),
        )}
        aria-hidden
      >
        {locked ? "?" : badge.name.charAt(0)}
      </div>
      <div>
        <p className={cn("text-xs font-semibold", locked ? "text-subtle" : "text-text")}>{badge.name}</p>
        <p className="sr-only">
          {locked ? "Locked. " : ""}
          {badge.description}
        </p>
      </div>
    </div>
  );
}
