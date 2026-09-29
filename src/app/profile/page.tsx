import type { Metadata } from "next";
import { XPBar } from "@/components/ui/XPBar";
import { AchievementBadge } from "@/components/ui/Badge";
import { SignInButton } from "@/components/layout/SignInButton";
import { FavoritesList } from "@/components/game/FavoritesList";
import { BADGES, MOCK_PLAYER } from "@/lib/mock-data";
import { formatNumber } from "@/lib/format";
import { levelFromXp } from "@/lib/xp";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  const p = MOCK_PLAYER;
  const { level } = levelFromXp(p.xp);
  const stats = [
    { k: "Level", v: String(level) },
    { k: "Games played", v: formatNumber(p.gamesPlayed) },
    { k: "Total score", v: formatNumber(p.totalScore) },
    { k: "Day streak", v: String(p.streakDays) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6">
      <section aria-labelledby="profile-name" className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan to-magenta font-display text-3xl font-black text-bg"
            aria-hidden
          >
            {p.username.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 id="profile-name" className="font-display text-2xl font-black uppercase tracking-wide">
              {p.username}
            </h1>
            <p className="text-sm text-muted">Playing as a guest. Progress is saved on this device only.</p>
            <XPBar xp={p.xp} className="mt-4 max-w-md" />
          </div>
          <SignInButton variant="accent" className="self-start sm:self-center">
            Create account
          </SignInButton>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.k} className="rounded-lg border border-border bg-surface-2 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted">{s.k}</dt>
              <dd className="mt-1 font-display text-2xl font-bold">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="badges-title">
        <h2 id="badges-title" className="mb-4 font-display text-xl font-bold uppercase">
          Badges
        </h2>
        <ul className="flex flex-wrap gap-4">
          {BADGES.map((b) => (
            <li key={b.id}>
              <AchievementBadge badge={b} locked={!p.badges.some((x) => x.id === b.id)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="favs-title">
        <h2 id="favs-title" className="mb-4 font-display text-xl font-bold uppercase">
          Favorites
        </h2>
        <FavoritesList />
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-4 font-display text-xl font-bold uppercase">
          Game history
        </h2>
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
          Your scored runs will appear here once you&apos;ve played a game.
        </p>
      </section>
    </div>
  );
}
