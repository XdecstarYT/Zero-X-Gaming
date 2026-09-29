"use client";

import { useEffect } from "react";
import { getSupabaseBrowser, type BrowserSupabase } from "@/lib/supabase/client";
import { syncFavoritesOnSignIn } from "@/lib/favorites-sync";
import { useAuth } from "@/store/auth";
import { useLibrary } from "@/store/library";
import { toast } from "@/store/toast";
import { applyProgress } from "@/lib/progress";

async function loadAccount(supabase: BrowserSupabase, userId: string) {
  // Streak first: the first visit of the day grants XP, so the profile read below sees it.
  const { data: streakRows } = await supabase.rpc("touch_daily_streak");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, xp")
    .eq("id", userId)
    .maybeSingle();
  const streak = streakRows?.[0];
  useAuth.getState().set({ profile: profile ?? null, streak: streak?.current_streak ?? 0 });
  if (streak && streak.xp_gained > 0) {
    toast(`Day ${streak.current_streak} streak · +${streak.xp_gained} XP`, { tone: "success" });
    applyProgress(profile?.xp ?? 0, streak.new_achievements ?? []);
  }
}

/** Subscribes to Supabase auth and mirrors it into the auth store. Renders nothing. */
export function AuthProvider() {
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const { set } = useAuth.getState();
    if (!supabase) {
      set({ status: "disabled" });
      return;
    }

    let currentUser: string | null = null;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      if (!user) {
        if (event === "SIGNED_OUT" && currentUser) {
          // Don't leave the last account's favorites on a shared device.
          useLibrary.setState({ favorites: [] });
        }
        currentUser = null;
        set({ status: "guest", userId: null, email: null, profile: null, streak: 0 });
        return;
      }
      if (user.id === currentUser) return; // token refresh etc.
      currentUser = user.id;
      set({ status: "signed_in", userId: user.id, email: user.email ?? null });

      // Defer Supabase calls out of the auth callback (avoids a known deadlock).
      setTimeout(() => {
        void loadAccount(supabase, user.id).catch(() => {});
        const whenHydrated = () =>
          syncFavoritesOnSignIn(supabase).catch(() =>
            toast("Couldn't sync favorites", { tone: "error", description: "We'll try again next time." }),
          );
        if (useLibrary.getState().hydrated) void whenHydrated();
        else {
          const unsub = useLibrary.subscribe((s) => {
            if (s.hydrated) {
              unsub();
              void whenHydrated();
            }
          });
        }
      }, 0);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
