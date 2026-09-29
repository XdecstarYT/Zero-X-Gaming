import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KeyAction = "jump" | "pause" | "left" | "right";

export const DEFAULT_KEYBINDINGS: Record<KeyAction, string> = {
  jump: "Space",
  pause: "KeyP",
  left: "ArrowLeft",
  right: "ArrowRight",
};

export interface SettingsState {
  sound: boolean;
  music: boolean;
  volume: number;
  reduceMotion: boolean;
  keybindings: Record<KeyAction, string>;
  setSound: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setVolume: (v: number) => void;
  setReduceMotion: (v: boolean) => void;
  setKeybinding: (action: KeyAction, code: string) => void;
  resetKeybindings: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      music: true,
      volume: 0.7,
      reduceMotion: false,
      keybindings: DEFAULT_KEYBINDINGS,
      setSound: (sound) => set({ sound }),
      setMusic: (music) => set({ music }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setKeybinding: (action, code) => set((s) => ({ keybindings: { ...s.keybindings, [action]: code } })),
      resetKeybindings: () => set({ keybindings: DEFAULT_KEYBINDINGS }),
    }),
    // Rehydrated manually in <Providers> so server and first client render match.
    { name: "zx-settings", version: 1, skipHydration: true },
  ),
);
