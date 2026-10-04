import type { Metadata } from "next";
import Link from "next/link";
import { Transmission } from "@/components/zlink/Transmission";
import { ZLinkHero } from "@/components/zlink/ZLinkHero";
import { ZLinkJoin } from "@/components/zlink/ZLinkJoin";
import { ZLinkDashboard } from "@/components/zlink/ZLinkDashboard";
import { GameArt } from "@/components/game/GameArt";
import { getGame } from "@/lib/catalog";
import { ZLINK_PERKS, zlinkGames } from "@/lib/zlink";

export const metadata: Metadata = {
  title: "ZLink+",
  description: "ZLink+: the members-only Zenith and Linkwave, every Sports+ game, UBusiness Ultimate, +25% XP and double daily rewards, for 40 coins a month.",
};

export default function ZLinkPage() {
  const games = zlinkGames();
  const siege = getGame("neon-siege");
  return (
    <div className="relative overflow-hidden pb-10">
      <div className="zx-scanlines" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-24 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(139_92_255/0.28),transparent_65%)]" aria-hidden />

      <section aria-labelledby="zlink-title" className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.2fr_1fr]">
        <div className="text-center lg:text-left">
          <p className="inline-block rounded-full border border-cyan/50 bg-cyan/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.35em] text-cyan">Now open</p>
          <h1 id="zlink-title" className="sr-only">
            ZLink+
          </h1>
          <div className="mt-4 lg:-ml-2">
            <ZLinkHero />
          </div>
          <Transmission className="mt-2 min-h-6" />
          <p className="mt-6 max-w-xl text-lg text-muted lg:max-w-none">
            One link, every plus: a members-only game, all of Sports+, UBusiness Ultimate, +25% XP and double daily coins, for 40 coins a
            month.
          </p>
        </div>
        <ZLinkJoin />
      </section>

      <ZLinkDashboard />

      <section aria-labelledby="zlink-perks" className="relative mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <h2 id="zlink-perks" className="font-display text-2xl font-black uppercase tracking-tight sm:text-3xl">
          What&apos;s in the link
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ZLINK_PERKS.map((p) => (
            <li key={p.title} className="zx-ring rounded-2xl border border-border bg-surface/90 p-5">
              <span className="text-4xl" aria-hidden>
                {p.icon}
              </span>
              <h3 className="mt-3 font-display text-lg font-black uppercase">{p.title}</h3>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="zlink-games" className="relative mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <h2 id="zlink-games" className="font-display text-2xl font-black uppercase tracking-tight sm:text-3xl">
          {games.length} games, one link
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="zlink-games">
          {games.map((g) => (
            <li key={g.slug}>
              <Link href={`/games/${g.slug}`} className="group block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-cyan">
                <div className="aspect-[16/10] overflow-hidden">
                  <GameArt game={g} className="transition-transform duration-500 group-hover:scale-105" />
                </div>
                <p className="truncate px-3 py-2 text-sm font-bold">{g.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {siege && (
        <section aria-labelledby="zlink-outside" className="relative mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div data-testid="zlink-outside" className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border-strong bg-surface/70 p-6 sm:flex-row sm:items-center">
            <div className="w-40 shrink-0 overflow-hidden rounded-lg opacity-70 grayscale">
              <GameArt game={siege} />
            </div>
            <div>
              <h2 id="zlink-outside" className="font-display text-xl font-black uppercase">
                Not part of ZLink+: {siege.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {siege.title} stays on its own: it&apos;s free to play, and its battle pass, item shop and Cash Cups are separate from
                ZLink+. Buy those as before.
              </p>
              <Link href="/battle-pass" className="mt-2 inline-block text-sm font-semibold text-cyan hover:underline">
                The battle pass →
              </Link>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="zlink-faq" className="relative mx-auto mt-16 max-w-3xl px-4 sm:px-6">
        <h2 id="zlink-faq" className="font-display text-xl font-black uppercase">
          Good to know
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          {[
            ["Does it renew by itself?", "No. It runs for 30 days, then stops. Add more days whenever you like and they stack on the end."],
            ["What if I already bought Sports+ or UBusiness?", "They're yours to keep either way. ZLink+ just adds the rest."],
            ["What happens when it ends?", "The member games lock again (unless you own them), and daily rewards and XP go back to normal. Your saves, scores and link level stay."],
            ["What are link levels?", "Every 30 days you join adds to your total: Bronze at 30, Silver at 90, Gold at 180 and Neon at 365. They never go down."],
            ["Can I pay with money?", "No: ZLink+ is coins only, like everything on Zero X."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl border border-border bg-surface/80 p-4">
              <dt className="font-bold">{q}</dt>
              <dd className="mt-1 text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
