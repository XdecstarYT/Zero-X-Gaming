"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { UBusinessTier } from "@/lib/economy";
import { buyUBusiness, claimUBusinessFree, loadCoins, ubusinessTier } from "@/lib/season-client";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";

interface UBState {
  /** undefined while loading; null when you own neither edition. */
  tier: UBusinessTier | null | undefined;
  busy: UBusinessTier | null;
  error: string | null;
  refresh: () => Promise<void>;
  buy: (tier: UBusinessTier) => Promise<boolean>;
  /** The launch offer: Ultimate free until the end of 31 October. */
  claim: () => Promise<boolean>;
}

/** Which UBusiness edition this player has: Lite (5 coins), Ultimate (30, or free with the battle pass). */
export const useUBusinessStore = create<UBState>()((set, get) => ({
  tier: undefined,
  busy: null,
  error: null,
  refresh: async () => {
    try {
      const [tier, coins] = await Promise.all([ubusinessTier(), loadCoins()]);
      set({ tier });
      try {
        if (tier) sessionStorage.setItem("zx-ubusiness-tier", tier);
        else sessionStorage.removeItem("zx-ubusiness-tier");
      } catch {}
      useWallet.getState().set(coins);
    } catch {
      set({ tier: null });
    }
  },
  buy: async (tier) => {
    if (get().busy) return false;
    set({ busy: tier, error: null });
    try {
      await buyUBusiness(tier);
      set({ tier, busy: null });
      // The game reads the edition from here when it starts.
      try {
        sessionStorage.setItem("zx-ubusiness-tier", tier);
      } catch {}
      return true;
    } catch (e) {
      set({ busy: null, error: (e as Error).message });
      return false;
    }
  },
  claim: async () => {
    if (get().busy) return false;
    set({ busy: "ultimate", error: null });
    try {
      await claimUBusinessFree();
      set({ tier: "ultimate", busy: null });
      try {
        sessionStorage.setItem("zx-ubusiness-tier", "ultimate");
      } catch {}
      return true;
    } catch (e) {
      set({ busy: null, error: (e as Error).message });
      return false;
    }
  },
}));

/** Loads (and re-loads on sign-in / sign-out) your UBusiness edition. */
export function useUBusiness(enabled = true) {
  const status = useAuth((s) => s.status);
  const state = useUBusinessStore();
  const refresh = state.refresh;
  useEffect(() => {
    if (status === "loading" || !enabled) return;
    void refresh();
  }, [status, refresh, enabled]);
  return state;
}
