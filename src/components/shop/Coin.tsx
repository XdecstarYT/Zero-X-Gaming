"use client";

import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { loadCoins } from "@/lib/season-client";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";

/** A gold coin glyph. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <circle cx="12" cy="12" r="10" fill="#f2c230" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#b8860b" strokeWidth="1.6" />
      <path
        d="M9 8h6l-6 8h6"
        fill="none"
        stroke="#7a5200"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "123 coins" with the icon. */
export function CoinAmount({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", className)}>
      <CoinIcon />
      {formatNumber(amount)}
      <span className="sr-only"> coins</span>
    </span>
  );
}

/** Header chip: coin balance, links to the Item Shop. */
export function CoinChip() {
  const status = useAuth((s) => s.status);
  const coins = useWallet((s) => s.coins);

  useEffect(() => {
    if (status === "loading") return;
    let live = true;
    loadCoins()
      .then((c) => live && useWallet.getState().set(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [status]);

  return (
    <Link
      href="/shop"
      aria-label={`Item Shop: ${coins ?? 0} coins`}
      className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm hover:border-[#f2c230]"
    >
      <CoinAmount amount={coins ?? 0} />
    </Link>
  );
}
