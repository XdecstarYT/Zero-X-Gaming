import Link from "next/link";
import { NextXLogo } from "@/components/nextx/NextXLogo";

/** A band on the home page: the NextX label, and the way into its app. */
export function NextXTeaser() {
  return (
    <section aria-label="NextX" className="mx-auto max-w-7xl px-4 sm:px-6">
      <Link
        href="/nextx"
        data-testid="nextx-teaser"
        className="group relative flex flex-col items-center justify-between gap-5 overflow-hidden rounded-2xl border border-[#8b5cff]/40 bg-[#04040d] px-6 py-8 text-white shadow-[0_30px_90px_-40px_#8b5cff] sm:flex-row sm:px-10"
      >
        <div className="nx-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <NextXLogo />
          <div className="sm:ml-4 sm:border-l sm:border-white/15 sm:pl-6">
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#22e5ff]">Next generation game production</p>
            <p className="mt-1 text-sm text-white/70">YourGov and Zero City: our biggest games, in an app of their own.</p>
          </div>
        </div>
        <span className="relative shrink-0 rounded-full bg-gradient-to-r from-[#ff2bd6] via-[#8b5cff] to-[#22e5ff] px-5 py-2 font-display text-sm font-bold uppercase tracking-wider text-white transition-transform group-hover:scale-105">
          Open NextX →
        </span>
      </Link>
    </section>
  );
}
