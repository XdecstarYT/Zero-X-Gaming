"use client";

import type { BrowserSupabase } from "@/lib/supabase/client";

export interface SubmitResult {
  personalBest: number;
}

const MESSAGES: Record<string, string> = {
  "not authenticated": "Sign in to save scores.",
  "game is not accepting scores": "This game isn't accepting scores yet.",
  "too many submissions": "Slow down! Wait a moment before submitting again.",
  "score not plausible for duration": "That score couldn't be verified.",
  "score out of range": "That score couldn't be verified.",
  "duration out of range": "That run was too short to count.",
};

export function scoreErrorMessage(message: string | undefined): string {
  return (message && MESSAGES[message]) ?? "Couldn't save your score. Check your connection.";
}

export async function submitScore(
  supabase: BrowserSupabase,
  slug: string,
  score: number,
  durationMs: number,
): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc("submit_score", {
    p_game_slug: slug,
    p_score: Math.floor(score),
    p_duration_ms: Math.round(durationMs),
  });
  if (error) throw new Error(scoreErrorMessage(error.message));
  const row = data?.[0];
  // Record the finished run for "recently played" / history (best effort).
  void supabase
    .from("play_sessions")
    .insert({
      game_slug: slug,
      started_at: new Date(Date.now() - durationMs).toISOString(),
      ended_at: new Date().toISOString(),
    })
    .then(() => {});
  return { personalBest: row?.personal_best ?? score };
}
