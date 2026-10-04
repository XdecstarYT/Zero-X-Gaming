"use client";

import { useState } from "react";
import { ZLinkMark } from "./ZLinkMark";

const TEASES = ["", "", "Hm?", "Patience.", "Not yet. 👁"];

/** The big mark. Poke the plus enough times and it answers. */
export function ZLinkHero() {
  const [n, setN] = useState(0);
  const said = TEASES[Math.min(n, TEASES.length - 1)];
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setN((x) => x + 1)}
        aria-label="ZLink+"
        className="rounded-xl focus-visible:outline-offset-8"
        data-testid="zlink-mark"
      >
        <ZLinkMark className="text-[22vw] sm:text-[11rem]" />
      </button>
      <p aria-live="polite" data-testid="zlink-egg" className="mt-2 h-6 font-mono text-sm text-magenta">
        {said}
      </p>
    </div>
  );
}
