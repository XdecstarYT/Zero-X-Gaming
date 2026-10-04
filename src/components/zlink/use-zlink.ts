"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { zlinkActive } from "@/lib/economy";
import { claimZlinkDrop, joinZlink, loadCoins, zlinkStatus } from "@/lib/season-client";
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
  daysTotal: number;
  lastDrop: number | null;
  refresh: () => Promise<void>;
  join: () => Promise<boolean>;
  claimDrop: () => Promise<boolean>;
  dismiss: () => void;
}

export const useZlinkStore = create<ZState>()((set, get) => ({
  until: undefined,
  busy: false,
  error: null,
  welcome: false,
  daysTotal: 0,
  lastDrop: null,
  dismiss: () => set({ welcome: false }),
  refresh: async () => {
    try {
      const [st, coins] = await Promise.all([zlinkStatus(), loadCoins()]);
      set({ until: st.until, daysTotal: st.daysTotal, lastDrop: st.lastDrop });
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
      set({ until: r.until, busy: false, welcome: true, daysTotal: get().daysTotal + 30 });
      // What it unlocks: let the other cards know.
      void useSportsPassStore.getState().refresh();
      void useUBusinessStore.getState().refresh();
      return true;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      return false;
    }
  },
  claimDrop: async () => {
    if (get().busy) return false;
    set({ busy: true, error: null });
    try {
      await claimZlinkDrop();
      set({ busy: false, lastDrop: Date.now() });
      return true;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      return false;
    }
  },
}));

/** Your ZLink+ membership (reloads on sign-in and sign-out). */
export function useZlink(enabled = true) {
  const status = useAuth((s) => s.status);
  const state = useZlinkStore();
  const refresh = state.refresh;
  useEffect(() => {
    if (status === "loading" || !enabled) return;
    void refresh();
  }, [status, refresh, enabled]);
  return { ...state, active: zlinkActive(state.until) };
}
