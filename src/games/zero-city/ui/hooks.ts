import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { Game } from "../game";
import { formatNumber, translate, type StringKey } from "../i18n";
import type { UIState } from "../store";

export const GameContext = createContext<Game | null>(null);

export function useGame() {
  const g = useContext(GameContext);
  if (!g) throw new Error("no game");
  return g;
}

export function useUI<T>(sel: (s: UIState) => T): T {
  return useStore(useGame().store, sel);
}

export function useT() {
  const lang = useUI((s) => s.lang);
  return (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export function useNum() {
  const lang = useUI((s) => s.lang);
  return (n: number) => formatNumber(lang, n);
}
