import Link from "next/link";
import { CoinIcon } from "@/components/shop/Coin";
import { CUP_BOUNTY, CUP_ENTRY, CUP_FIELD, CUP_FREE_WITH_PASS, placePrize } from "@/lib/cash-cup";

/** A band on the home page: what a Cash Cup is in a line, and the way in. */
export function CashCupTeaser() {
  return (
    <section aria-label="Cash Cup" className="mx-auto max-w-7xl px-4 sm:px-6">
      <Link
        href="/cash-cup"
        data-testid="cash-cup-teaser"
        className="group relative flex flex-col items-center justify-between gap-4 overflow-hidden rounded-2xl border border-[#10b981]/40 bg-[#030806] px-6 py-8 text-white shadow-[0_30px_90px_-40px_#10b981] sm:flex-row sm:px-10"
      >
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <CoinIcon className="h-14 w-14 drop-shadow-[0_0_24px_rgba(16,185,129,0.6)]" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#10b981]">Neon Siege tournaments</p>
            <p className="mt-1 font-display text-4xl font-black uppercase tracking-tight sm:text-5xl">Cash Cup</p>
            <p className="mt-1 text-sm text-white/70">
              {CUP_FIELD} fighters, {placePrize(1)} ZX Cash for the win and {CUP_BOUNTY} per elimination. {CUP_ENTRY} to enter; the
              battle pass gives {CUP_FREE_WITH_PASS} free entries.
            </p>
          </div>
        </div>
        <span className="relative shrink-0 rounded-full bg-[#10b981] px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-[#022c22] transition-transform group-hover:scale-105">
          Enter a cup →
        </span>
      </Link>
    </section>
  );
}
