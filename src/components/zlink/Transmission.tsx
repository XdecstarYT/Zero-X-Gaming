"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { scramble, TRANSMISSIONS } from "@/lib/zlink";

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true";

/**
 * Lines decrypting out of noise, one after another. Screen readers get the
 * lines once, plainly; the animation itself is hidden from them.
 */
export function Transmission({ className }: { className?: string }) {
  const reduce = useSyncExternalStore(
    () => () => {},
    still,
    () => true,
  );
  const [i, setI] = useState(0);
  const [t, setT] = useState(0);
  const line = TRANSMISSIONS[i % TRANSMISSIONS.length];

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = (now - start) / 1400;
      setT(Math.min(1, k));
      if (k < 2.6) raf = requestAnimationFrame(tick);
      else setI((n) => n + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, reduce]);

  return (
    <div className={className}>
      <p aria-hidden="true" data-testid="zlink-transmission" className="font-mono text-sm tracking-[0.3em] text-cyan sm:text-base">
        <span className="text-subtle">&gt; </span>
        {reduce ? line : scramble(line, t)}
        <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-cyan align-middle" />
      </p>
      <ul className="sr-only">
        {TRANSMISSIONS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
