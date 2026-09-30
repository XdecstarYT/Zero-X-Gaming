"use client";

import { useEffect, useState } from "react";
import { loadSeasonState, type SeasonState } from "@/lib/season-client";
import { useAuth } from "@/store/auth";

/** Season state for the current player; reloads when they sign in or out. */
export function useSeason() {
  const status = useAuth((s) => s.status);
  const [state, setState] = useState<SeasonState | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status === "loading") return;
    let live = true;
    loadSeasonState()
      .then((s) => {
        if (!live) return;
        setState(s);
        setError(false);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [status, version]);

  return { state, error, reload: () => setVersion((v) => v + 1), setState };
}
