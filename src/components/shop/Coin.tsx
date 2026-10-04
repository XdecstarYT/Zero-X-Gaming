"use client";

import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { loadCoins } from "@/lib/season-client";
import { useAuth } from "@/store/auth";
import { useWallet } from "@/store/wallet";

/** The ZX Cash mark: an emerald token with a Z struck through like a currency sign. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#10b981" />
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.2" fill="none" stroke="#a7f3d0" strokeWidth="1.2" opacity=".7" />
      <path d="M8.5 8h7l-7 8h7" fill="none" stroke="#022c22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 5.5v13" stroke="#022c22" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** "123 ZX Cash" with the mark. */
export function CoinAmount({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", className)}>
      <CoinIcon />
      {formatNumber(amount)}
      <span className="sr-only"> ZX Cash</span>
    </span>
  );
}

/** Header chip: the ZX Cash balance, links to the Item Shop. */
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
      aria-label={`Item Shop: ${coins ?? 0} ZX Cash`}
      className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm hover:border-[#10b981]"
    >
      <CoinAmount amount={coins ?? 0} />
    </Link>
  );
}
