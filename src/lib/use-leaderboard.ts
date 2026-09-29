"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { levelFromXp } from "@/lib/xp";
import type { LeaderboardEntry } from "@/lib/types";
import { useAuth } from "@/store/auth";

export type Period = "daily" | "weekly" | "all";

export type LeaderboardState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error" }
  | { status: "ready"; entries: LeaderboardEntry[] };

type Result = { key: string; ok: true; entries: LeaderboardEntry[] } | { key: string; ok: false };

/** Reads a board via the read-only `get_leaderboard` RPC. `game` null = global XP board. */
export function useLeaderboard(game: string | null, period: Period, limit = 10) {
  const userId = useAuth((s) => s.userId);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${game}|${period}|${limit}|${nonce}`;

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    supabase
      .rpc("get_leaderboard", { p_game_slug: game ?? undefined, p_period: period, p_limit: limit })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) return setResult({ key, ok: false });
        setResult({
          key,
          ok: true,
          entries: data.map((r) => ({
            rank: r.rank,
            username: r.username,
            level: levelFromXp(r.xp).level,
            score: r.score,
            userId: r.user_id,
          })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [game, period, limit, key]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  let state: LeaderboardState;
  if (!isSupabaseConfigured) state = { status: "disabled" };
  else if (!result || result.key !== key) state = { status: "loading" };
  else if (!result.ok) state = { status: "error" };
  else
    state = {
      status: "ready",
      entries: result.entries.map((e) => ({ ...e, isCurrentUser: !!userId && e.userId === userId })),
    };
  return { state, retry };
}
