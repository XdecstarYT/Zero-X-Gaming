"use client";

import type { BrowserSupabase } from "@/lib/supabase/client";
import { mergeFavorites } from "@/lib/auth";
import { GAMES } from "@/lib/catalog";
import { useLibrary } from "@/store/library";

const KNOWN = new Set(GAMES.map((g) => g.slug));

/** On sign-in: upload guest favorites, then adopt the merged list locally. */
export async function syncFavoritesOnSignIn(supabase: BrowserSupabase) {
  const { data, error } = await supabase
    .from("favorites")
    .select("game_slug")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const remote = data.map((r) => r.game_slug);
  const { merged, toUpload } = mergeFavorites(useLibrary.getState().favorites, remote, KNOWN);
  if (toUpload.length) {
    const { error: upErr } = await supabase.from("favorites").upsert(
      toUpload.map((game_slug) => ({ game_slug })),
      { onConflict: "user_id,game_slug", ignoreDuplicates: true },
    );
    if (upErr) throw upErr;
  }
  useLibrary.setState({ favorites: merged });
}

export async function setFavoriteRemote(supabase: BrowserSupabase, userId: string, slug: string, favorite: boolean) {
  const { error } = favorite
    ? await supabase
        .from("favorites")
        .upsert({ game_slug: slug }, { onConflict: "user_id,game_slug", ignoreDuplicates: true })
    : await supabase.from("favorites").delete().eq("user_id", userId).eq("game_slug", slug);
  if (error) throw error;
}
