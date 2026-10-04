"use client";

import Link from "next/link";
import { useZlink } from "./use-zlink";

/** The glowing Z+ beside your coins, for members only. */
export function ZLinkMemberMark() {
  const { active } = useZlink();
  if (!active) return null;
  return (
    <Link
      href="/zlink"
      aria-label="ZLink+ member"
      title="ZLink+ member"
      data-testid="zlink-member"
      className="grid h-9 place-items-center rounded-full border border-violet/60 bg-gradient-to-br from-cyan/20 via-violet/25 to-magenta/20 px-2.5 font-display text-xs font-black text-text shadow-[0_0_18px_-4px_var(--zx-violet)]"
    >
      Z+
    </Link>
  );
}
