import type { Metadata } from "next";
import { XPBar } from "@/components/ui/XPBar";
import { AchievementBadge } from "@/components/ui/Badge";
import { SignInButton } from "@/components/layout/SignInButton";
import { Avatar } from "@/components/layout/AccountControl";
import { UsernameForm } from "@/components/layout/UsernameForm";
import { FavoritesList } from "@/components/game/FavoritesList";
import Link from "next/link";
import { BADGES, MOCK_PLAYER, getGame } from "@/lib/catalog";
import { formatNumber, timeAgo } from "@/lib/format";
import { levelFromXp } from "@/lib/xp";
import { getSupabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile" };

interface ProfileData {
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  xp: number;
  streak: number;
  longestStreak: number;
  gamesPlayed: number;
  totalScore: number;
  earned: Set<string>;
  history: { game_slug: string; score: number; created_at: string }[];
}

async function loadProfile(): Promise<ProfileData | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims.sub;
  if (!uid) return null;

  const [profile, streak, achievements, scores, history] = await Promise.all([
    supabase.from("profiles").select("username, avatar_url, xp").eq("id", uid).maybeSingle(),
    supabase.from("daily_streaks").select("current_streak, longest_streak").eq("user_id", uid).maybeSingle(),
    supabase.from("player_achievements").select("achievement_id").eq("user_id", uid),
    supabase.from("scores").select("score", { count: "exact" }).eq("user_id", uid).limit(1000),
    supabase
      .from("scores")
      .select("game_slug, score, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (!profile.data) return null;

  return {
    userId: uid,
    username: profile.data.username,
    avatarUrl: profile.data.avatar_url,
    xp: profile.data.xp,
    streak: streak.data?.current_streak ?? 0,
    longestStreak: streak.data?.longest_streak ?? 0,
    gamesPlayed: scores.count ?? 0,
    totalScore: (scores.data ?? []).reduce((n, r) => n + r.score, 0),
    earned: new Set((achievements.data ?? []).map((a) => a.achievement_id)),
    history: history.data ?? [],
  };
}

export default async function ProfilePage() {
  const account = await loadProfile();
  const p: ProfileData = account ?? {
    userId: null,
    username: MOCK_PLAYER.username,
    avatarUrl: null,
    xp: 0,
    streak: 0,
    longestStreak: 0,
    gamesPlayed: 0,
    totalScore: 0,
    earned: new Set(),
    history: [],
  };
  const isGuest = !account;
  const { level } = levelFromXp(p.xp);
  const stats = [
    { k: "Level", v: String(level) },
    { k: "Games played", v: formatNumber(p.gamesPlayed) },
    { k: "Total score", v: formatNumber(p.totalScore) },
    { k: "Day streak", v: isGuest ? "0" : `${p.streak} (best ${p.longestStreak})` },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6">
      <section aria-labelledby="profile-name" className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <Avatar name={p.username} url={p.avatarUrl} className="h-20 w-20 shrink-0 text-3xl" />
          <div className="flex-1">
            <h1 id="profile-name" className="font-display text-2xl font-black uppercase tracking-wide">
              {p.username}
            </h1>
            <p className="text-sm text-muted">
              {isGuest
                ? "Playing as a guest. Progress is saved on this device only."
                : "Your progress is saved to your account."}
            </p>
            <XPBar xp={p.xp} className="mt-4 max-w-md" />
          </div>
          {isGuest && (
            <SignInButton variant="accent" className="self-start sm:self-center" initialMode="sign_up">
              Create account
            </SignInButton>
          )}
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

      {!isGuest && p.userId && (
        <section aria-labelledby="account-title" className="rounded-xl border border-border bg-surface p-6">
          <h2 id="account-title" className="mb-4 font-display text-xl font-bold uppercase">
            Account
          </h2>
          <UsernameForm userId={p.userId} current={p.username} />
        </section>
      )}

      <section aria-labelledby="badges-title">
        <h2 id="badges-title" className="mb-4 font-display text-xl font-bold uppercase">
          Badges
        </h2>
        <ul className="flex flex-wrap gap-4">
          {BADGES.map((b) => (
            <li key={b.id}>
              <AchievementBadge badge={b} locked={!p.earned.has(b.id)} />
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
        {p.history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            {isGuest
              ? "Sign in to keep a history of your runs."
              : "No saved runs yet. Play a game and your scores will show up here."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">Your 10 most recent runs</caption>
              <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Game
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Score
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.history.map((h, i) => (
                  <tr key={`${h.created_at}-${i}`} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <Link href={`/games/${h.game_slug}`} className="font-semibold hover:text-cyan">
                        {getGame(h.game_slug)?.title ?? h.game_slug}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNumber(h.score)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{timeAgo(h.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
