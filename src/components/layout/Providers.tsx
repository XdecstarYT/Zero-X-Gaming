"use client";

import { useEffect, type ReactNode } from "react";
import { useSettings } from "@/store/settings";
import { useLibrary } from "@/store/library";
import { AuthProvider } from "./AuthProvider";

/**
 * Rehydrates persisted stores after mount (so SSR markup matches the first
 * client render) and mirrors the reduce-motion setting onto <html>.
 */
export function Providers({ children }: { children: ReactNode }) {
  const reduceMotion = useSettings((s) => s.reduceMotion);

  useEffect(() => {
    useSettings.persist.rehydrate();
    useLibrary.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  return (
    <>
      <AuthProvider />
      {children}
    </>
  );
}
