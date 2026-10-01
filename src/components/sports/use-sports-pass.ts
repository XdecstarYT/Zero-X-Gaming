"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { buySportsPass, hasSportsPass, loadCoins } from "@/lib/season-client";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";

interface PassState {
  /** null while loading. */
  owned: boolean | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  buy: () => Promise<boolean>;
}

/** Whether this player owns the Sports+ pass (one-time, 50 coins). */
export const useSportsPassStore = create<PassState>()((set, get) => ({
  owned: null,
  busy: false,
  error: null,
  refresh: async () => {
    try {
      const [owned, coins] = await Promise.all([hasSportsPass(), loadCoins()]);
      set({ owned });
      useWallet.getState().set(coins);
    } catch {
      set({ owned: false });
    }
  },
  buy: async () => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      await buySportsPass();
      set({ owned: true, busy: false });
      return true;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      return false;
    }
  },
}));

/** Loads (and re-loads on sign-in / sign-out) the Sports+ pass state. */
export function useSportsPass() {
  const status = useAuth((s) => s.status);
  const state = useSportsPassStore();
  const refresh = state.refresh;
  useEffect(() => {
    if (status === "loading") return;
    void refresh();
  }, [status, refresh]);
  return state;
}
