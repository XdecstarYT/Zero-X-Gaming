import { create } from "zustand";

/** The player's coin balance (null until loaded). Kept fresh by season-client. */
export const useWallet = create<{ coins: number | null; set: (coins: number) => void }>()((set) => ({
  coins: null,
  set: (coins) => set({ coins }),
}));
