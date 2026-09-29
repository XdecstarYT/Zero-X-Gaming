import { formatNumber } from "@/lib/format";
import { levelFromXp } from "@/lib/xp";
import { cn } from "@/lib/cn";

export function XPBar({ xp, compact = false, className }: { xp: number; compact?: boolean; className?: string }) {
  const { level, xpIntoLevel, xpForLevel, progress, isMaxLevel } = levelFromXp(xp);
  const pct = Math.round(progress * 100);

  return (
    <div className={cn("w-full", className)}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-display font-bold uppercase tracking-wider text-cyan">Lvl {level}</span>
          <span className="text-muted">
            {isMaxLevel ? "Max level" : `${formatNumber(xpIntoLevel)} / ${formatNumber(xpForLevel)} XP`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={`Level ${level} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={isMaxLevel ? "Max level" : `${pct}% to level ${level + 1}`}
        className={cn("overflow-hidden rounded-full bg-surface-3", compact ? "h-1.5" : "h-2.5")}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan to-magenta shadow-[0_0_12px_rgb(34_229_255/0.6)] transition-[width] duration-500 ease-zx"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
