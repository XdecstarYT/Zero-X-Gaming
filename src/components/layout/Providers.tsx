"use client";

import { useEffect, type ReactNode } from "react";
import { useSettings } from "@/store/settings";
import { useLibrary } from "@/store/library";
import { AuthProvider } from "./AuthProvider";

/**
 * Rehydrates persisted stores after mount (so SSR markup matches the first
 * client render) and mirrors the theme and reduce-motion settings onto <html>.
 */
export function Providers({ children }: { children: ReactNode }) {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    useSettings.persist.rehydrate();
    useLibrary.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "x1") root.dataset.theme = "x1";
    else delete root.dataset.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "x1" ? "#f5f7ff" : "#05060b");
  }, [theme]);

  return (
    <>
      <AuthProvider />
      {children}
    </>
  );
}
