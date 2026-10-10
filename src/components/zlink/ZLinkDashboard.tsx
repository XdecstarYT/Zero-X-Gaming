"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { GameArt } from "@/components/game/GameArt";
import { getGame } from "@/lib/catalog";
import { LINK_LEVELS, linkLevel, ZLINK_DROP, zlinkDaysLeft, zlinkDropIn, zlinkDropReady } from "@/lib/economy";
import { useZlink } from "./use-zlink";
import { gameHref } from "@/lib/nextx";

/** For members: the exclusive game up front, your link level, and the weekly drop. */
export function ZLinkDashboard() {
  const z = useZlink();
  if (!z.active) return null;
  // The flagship exclusive up front; the other one alongside.
  const lw = getGame("zero-city");
  const also = getGame("yourgov");
  const lv = linkLevel(z.daysTotal);
  const ready = zlinkDropReady(z.lastDrop);
  const nextDrop = zlinkDropIn(z.lastDrop);
  return (
    <section aria-labelledby="zlink-dash" data-testid="zlink-dashboard" className="relative mx-auto mt-14 max-w-6xl px-4 sm:px-6">
      <h2 id="zlink-dash" className="font-display text-2xl font-black uppercase tracking-tight sm:text-3xl">
        Your link
      </h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {lw && (
          <div className="grid gap-3">
            <Link href={gameHref(lw.slug)} data-testid="zlink-exclusive" className="zx-ring group relative overflow-hidden rounded-2xl border border-violet/60 bg-surface">
              <div className="aspect-[16/8] overflow-hidden">
                <GameArt game={lw} className="transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/10" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet">Members only</p>
                <p className="mt-1 font-display text-3xl font-black uppercase text-white">{lw.title}</p>
                <p className="text-sm text-white/80">{lw.tagline}</p>
                <span className="mt-3 inline-block rounded-full bg-violet px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-white">Play now →</span>
              </div>
            </Link>
            {also && (
              <Link href={gameHref(also.slug)} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3 hover:border-violet" data-testid="zlink-also">
                <span>
                  <span className="block text-xs font-bold uppercase tracking-[0.3em] text-violet">Also members only</span>
                  <span className="font-display text-lg font-black uppercase">{also.title}</span>
                  <span className="ml-2 text-sm text-muted">{also.tagline}</span>
                </span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        )}
        <div className="grid gap-4">
          <div className="rounded-2xl border border-border bg-surface p-5" data-testid="zlink-level">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-subtle">Link level</p>
            <p className="mt-1 font-display text-3xl font-black uppercase" style={{ color: lv.level.color }}>
              {lv.level.name}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Progress to the next link level" aria-valuenow={Math.round(lv.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-cyan via-violet to-magenta" style={{ width: `${lv.progress * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {z.daysTotal} days linked{lv.next ? ` · ${lv.next.days - z.daysTotal} more to ${lv.next.name}` : " · the top level"} · {zlinkDaysLeft(z.until)} left on this link
            </p>
            <ol className="mt-3 flex gap-1.5" aria-label="Levels">
              {LINK_LEVELS.map((l, i) => (
                <li key={l.name} title={`${l.name}: ${l.days} days`} className={`h-1.5 flex-1 rounded-full ${i <= lv.index ? "" : "opacity-25"}`} style={{ background: l.color }} />
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-subtle">Weekly drop</p>
            <p className="mt-1 font-display text-2xl font-black uppercase">{ZLINK_DROP} ZX Cash</p>
            {ready ? (
              <Button className="mt-3" onClick={() => void z.claimDrop()} disabled={z.busy} data-testid="zlink-drop">
                Claim {ZLINK_DROP} ZX Cash
              </Button>
            ) : (
              <p className="mt-2 text-sm text-muted" data-testid="zlink-drop-wait">
                Taken. The next one lands in {nextDrop} day{nextDrop === 1 ? "" : "s"}.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
