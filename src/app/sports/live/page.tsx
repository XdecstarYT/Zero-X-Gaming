import type { Metadata } from "next";
import { LiveSports } from "@/components/sports/LiveSports";
import { CHANNELS, type ChannelId } from "@/games/live/schedule";

export const metadata: Metadata = {
  title: "Sports+ Live",
  description: "Watch live Sports+ matches, free: Aussie rules on Screamer TV, a home run derby on Derby Night and singles tennis on Centre Court, 24/7.",
};

export default async function LivePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const q = await searchParams;
  const ch = typeof q.channel === "string" && CHANNELS.some((c) => c.id === q.channel) ? (q.channel as ChannelId) : "footy";
  const into = typeof q.into === "string" && /^\d+$/.test(q.into) ? Number(q.into) : undefined;
  return (
    <div className="pb-10">
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-40"
          aria-hidden
          style={{ background: "radial-gradient(circle at 15% 20%, #ef444455, transparent 40%), radial-gradient(circle at 85% 30%, #22d3ee44, transparent 40%)" }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-magenta">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
            On air now
          </p>
          <h1 className="mt-1 font-display text-4xl font-black uppercase italic tracking-tight sm:text-6xl">
            Sports<span className="text-cyan">+</span> Live
          </h1>
          <p className="mt-2 max-w-2xl text-muted">Three channels, around the clock, free to watch. Pick one and pull up a seat.</p>
        </div>
      </section>
      <div className="mt-6">
        <LiveSports initial={ch} into={into} />
      </div>
    </div>
  );
}
