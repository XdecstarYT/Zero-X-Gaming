"use client";

import { quietHere } from "@/lib/quiet";
import { useEffect, useState } from "react";
import { MEGA_AD_KEY } from "./MegaAd";

/** Every spot's "played this visit" key: one ad per visit, whichever it was. */
export const AD_SESSION_KEYS = ["zx-ubusiness-ad-session", "zx-cricket-ad-session", "zx-clanforge-ad-session", "zx-sports-ad-session", "zx-code3-ad-session"];

/**
 * Whose turn it is to play an ad after the intro. Spots queue up in order
 * through data attributes on <html> (`data-<name>` = pending, playing, done
 * or skip): a spot waits until the one before it has skipped, never plays in
 * the same visit as another spot or the one-time mega ad, never on invite
 * links, and stops after `runs` plays in this browser. With a `chance`, a
 * spot only turns up on that share of visits (rolled once per visit); when it
 * doesn't, it steps aside for the next spot. While it plays the rest of the
 * page is inert and can't scroll.
 */
export function useAdTurn(o: { name: string; elementId: string; countKey: string; sessionKey: string; runs: number; seconds: number; after?: string; chance?: number }) {
  const [state, setState] = useState<"waiting" | "playing" | "done">("waiting");
  const { name, elementId, countKey, sessionKey, runs, seconds, after, chance = 1 } = o;

  useEffect(() => {
    const root = document.documentElement;
    let played = runs;
    let megaDue = false;
    let thisVisit = false;
    try {
      played = Number(localStorage.getItem(countKey) ?? "0") || 0;
      megaDue = localStorage.getItem(MEGA_AD_KEY) !== "1";
      thisVisit = AD_SESSION_KEYS.some((k) => sessionStorage.getItem(k) === "1");
    } catch {
      played = runs;
    }
    const invite = quietHere();
    const finish = (mark: "done" | "skip") => {
      root.dataset[name] = mark;
      return window.setTimeout(() => setState("done"), 0);
    };
    if (thisVisit || megaDue) {
      const id = finish("done");
      return () => clearTimeout(id);
    }
    if (played >= runs || invite || !rolled(name, chance)) {
      const id = finish("skip");
      return () => clearTimeout(id);
    }
    root.dataset[name] = "pending";
    const poll = window.setInterval(() => {
      if (after) {
        const prev = root.dataset[after];
        if (prev === "playing" || prev === "done") {
          clearInterval(poll);
          finish("done");
          return;
        }
        if (prev !== "skip") return;
      }
      if (root.dataset.intro === "done" && !document.getElementById("zx-intro") && !document.getElementById("zx-mega-ad")) {
        clearInterval(poll);
        try {
          localStorage.setItem(countKey, String(played + 1));
          sessionStorage.setItem(sessionKey, "1");
        } catch {}
        root.dataset[name] = "playing";
        setState("playing");
      }
    }, 150);
    return () => clearInterval(poll);
  }, [name, countKey, sessionKey, runs, after, chance]);

  useEffect(() => {
    if (state !== "playing") return;
    const siblings = Array.from(document.body.children).filter((el) => el.id !== elementId) as HTMLElement[];
    siblings.forEach((el) => (el.inert = true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => setState("done"), seconds * 1000);
    return () => {
      clearTimeout(id);
      siblings.forEach((el) => (el.inert = false));
      document.body.style.overflow = prev;
      document.documentElement.dataset[name] = "done";
    };
  }, [state, elementId, seconds, name]);

  return { playing: state === "playing", stop: () => setState("done") };
}

/** Does this spot turn up this visit? Rolled once per visit and kept, so a re-render can't re-roll it. */
export function rolled(name: string, chance: number) {
  if (chance >= 1) return true;
  const key = `zx-ad-roll-${name}`;
  try {
    const kept = sessionStorage.getItem(key);
    if (kept === "1" || kept === "0") return kept === "1";
    const yes = Math.random() < chance;
    sessionStorage.setItem(key, yes ? "1" : "0");
    return yes;
  } catch {
    return Math.random() < chance;
  }
}
