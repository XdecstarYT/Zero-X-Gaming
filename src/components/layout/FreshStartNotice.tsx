"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CoinIcon } from "@/components/shop/Coin";
import { FRESH_SEEN_KEY, FRESH_START_EPOCH } from "@/lib/fresh-start";
import { useAuth } from "@/store/auth";

/**
 * Once per device: tells returning players that coins are now ZX Cash and
 * everyone has started again. Shown to anyone whose old saves were cleared,
 * and to every signed-in player (their account was reset on the server).
 * Waits for the intro and any other popup to finish first.
 */
export function FreshStartNotice() {
  const status = useAuth((s) => s.status);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    let seen = true;
    try {
      seen = localStorage.getItem(FRESH_SEEN_KEY) === FRESH_START_EPOCH;
    } catch {
      return;
    }
    const returning = document.documentElement.dataset.fresh === "1" || status === "signed_in" || status === "device";
    if (seen || !returning) return;
    const t = window.setInterval(() => {
      if (document.documentElement.dataset.intro !== "done") return;
      if (document.querySelector("dialog[open]")) return;
      window.clearInterval(t);
      setOpen(true);
    }, 1200);
    return () => window.clearInterval(t);
  }, [status]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(FRESH_SEEN_KEY, FRESH_START_EPOCH);
    } catch {
      // Not remembered: it shows again next visit.
    }
  };

  return (
    <Modal open={open} onClose={close} title="Welcome to ZX Cash">
      <div className="flex flex-col items-center gap-3 text-center" data-testid="fresh-start">
        <CoinIcon className="h-16 w-16 drop-shadow-[0_0_24px_rgba(16,185,129,0.6)]" />
        <p className="text-sm text-muted">
          Coins are now <strong className="text-text">ZX Cash</strong>, and everyone starts fresh: balances, ZLink+, the battle pass, unlocks, XP and game saves have all been reset to zero. Your account, username and settings are still here, and so are the leaderboards.
        </p>
        <p className="text-sm text-muted">Earn ZX Cash from daily rewards, the battle pass free lane and Cash Cups.</p>
        <div className="mt-1 flex gap-2">
          <Link href="/" onClick={close} className="rounded-full bg-[#10b981] px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-[#022c22]">
            Claim today&apos;s reward
          </Link>
          <button type="button" onClick={close} className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:border-border-strong">
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
