"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { zlinkActive } from "@/lib/economy";
import { joinZlink, loadCoins, zlinkUntil } from "@/lib/season-client";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";
import { useSportsPassStore } from "@/components/sports/use-sports-pass";
import { useUBusinessStore } from "@/components/ubusiness/use-ubusiness";

interface ZState {
  /** undefined while loading; null if never joined. */
  until: number | null | undefined;
  busy: boolean;
  error: string | null;
  /** Just joined: the welcome plays. */
  welcome: boolean;
  refresh: () => Promise<void>;
  join: () => Promise<boolean>;
  dismiss: () => void;
}

export const useZlinkStore = create<ZState>()((set, get) => ({
  until: undefined,
  busy: false,
  error: null,
  welcome: false,
  dismiss: () => set({ welcome: false }),
  refresh: async () => {
    try {
      const [until, coins] = await Promise.all([zlinkUntil(), loadCoins()]);
      set({ until });
      useWallet.getState().set(coins);
    } catch {
      set({ until: null });
    }
  },
  join: async () => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      const r = await joinZlink();
      set({ until: r.until, busy: false, welcome: true });
      // What it unlocks: let the other cards know.
      void useSportsPassStore.getState().refresh();
      void useUBusinessStore.getState().refresh();
      return true;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      return false;
    }
  },
}));

/** Your ZLink+ membership (reloads on sign-in and sign-out). */
export function useZlink() {
  const status = useAuth((s) => s.status);
  const state = useZlinkStore();
  const refresh = state.refresh;
  useEffect(() => {
    if (status === "loading") return;
    void refresh();
  }, [status, refresh]);
  return { ...state, active: zlinkActive(state.until) };
}
