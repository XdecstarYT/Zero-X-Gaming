import type { LeaderboardEntry } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

const medal: Record<number, string> = {
  1: "text-warning",
  2: "text-[#d8dde8]",
  3: "text-[#e0a36d]",
};

export function LeaderboardTable({
  entries,
  caption,
  className,
}: {
  entries: LeaderboardEntry[];
  caption: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border p-8 text-center", className)}>
        <p className="font-display text-sm font-bold uppercase tracking-wider">No scores yet</p>
        <p className="mt-1 text-sm text-muted">Be the first to put a score on the board.</p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="w-14 px-4 py-2.5 font-semibold">
              #
            </th>
            <th scope="col" className="px-2 py-2.5 font-semibold">
              Player
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={`${e.rank}-${e.username}`}
              className={cn("border-t border-border", e.isCurrentUser && "bg-cyan/5")}
              aria-current={e.isCurrentUser ? "true" : undefined}
            >
              <td className={cn("px-4 py-2.5 font-display font-bold", medal[e.rank] ?? "text-subtle")}>{e.rank}</td>
              <td className="px-2 py-2.5">
                <span className="font-semibold">{e.username}</span>
                <span className="ml-2 text-xs text-muted">Lvl {e.level}</span>
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNumber(e.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
