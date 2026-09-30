"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CosmeticKind } from "@/lib/season";

/** Shared store of rendered item images (data URLs), filled lazily by the 3D thumbnail renderer. */
const thumbs = new Map<string, string>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let disabled = false;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function request(kind: "outfit" | "wrap", item: string) {
  const key = `${kind}:${item}`;
  if (disabled || requested.has(key)) return;
  requested.add(key);
  import("@/games/neon-siege/three/thumbs")
    .then((m) => m.renderThumb(kind, item))
    .then((url) => {
      thumbs.set(key, url);
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // No WebGL: keep the flat illustrations everywhere.
      disabled = true;
    });
}

/** A 3D-rendered image of an outfit or wrap, or null while it renders (or without WebGL). */
export function useItemThumb(kind: CosmeticKind, item: string): string | null {
  const key = `${kind}:${item}`;
  const url = useSyncExternalStore(
    subscribe,
    () => thumbs.get(key) ?? null,
    () => null,
  );
  useEffect(() => {
    if (kind !== "banner") request(kind, item);
  }, [kind, item]);
  return url;
}
