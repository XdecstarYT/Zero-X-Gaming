import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KeyAction = "jump" | "pause" | "left" | "right";

export const DEFAULT_KEYBINDINGS: Record<KeyAction, string> = {
  jump: "Space",
  pause: "KeyP",
  left: "ArrowLeft",
  right: "ArrowRight",
};

/** Site themes: "classic" (dark neon) and "x1" (X-1+: light, friendly). */
export type Theme = "classic" | "x1";
export const THEMES: Theme[] = ["classic", "x1"];
export const SETTINGS_KEY = "zx-settings";

export interface SettingsState {
  theme: Theme;
  sound: boolean;
  music: boolean;
  volume: number;
  reduceMotion: boolean;
  keybindings: Record<KeyAction, string>;
  setTheme: (t: Theme) => void;
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
      theme: "classic",
      sound: true,
      music: true,
      volume: 0.7,
      reduceMotion: false,
      keybindings: DEFAULT_KEYBINDINGS,
      setTheme: (theme) => set({ theme }),
      setSound: (sound) => set({ sound }),
      setMusic: (music) => set({ music }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setKeybinding: (action, code) => set((s) => ({ keybindings: { ...s.keybindings, [action]: code } })),
      resetKeybindings: () => set({ keybindings: DEFAULT_KEYBINDINGS }),
    }),
    // Rehydrated manually in <Providers> so server and first client render match.
    {
      name: SETTINGS_KEY,
      version: 2,
      skipHydration: true,
      migrate: (state) => ({ theme: "classic", ...(state as object) }) as SettingsState,
    },
  ),
);

/**
 * Inline <head> script: applies the saved theme before first paint (no flash).
 * Reads the same persisted settings the store uses.
 */
export const themeScript = `try{var t=JSON.parse(localStorage.getItem("${SETTINGS_KEY}")||"{}").state;if(t&&t.theme==="x1")document.documentElement.dataset.theme="x1"}catch(e){}`;
