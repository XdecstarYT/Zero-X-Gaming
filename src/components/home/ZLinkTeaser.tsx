import Link from "next/link";
import { ZLinkMark } from "@/components/zlink/ZLinkMark";

/** A band on the home page: the mark, what it is in a line, and the way in. */
export function ZLinkTeaser() {
  return (
    <section aria-label="ZLink+" className="mx-auto max-w-7xl px-4 sm:px-6">
      <Link
        href="/zlink"
        data-testid="zlink-teaser"
        className="zx-ring group relative flex flex-col items-center justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-[#05060b] px-6 py-8 text-white sm:flex-row sm:px-10"
      >
        <div className="zx-scanlines" aria-hidden />
        <div className="relative text-center sm:text-left">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-[#22e5ff]">Now open</p>
          <ZLinkMark className="mt-1 text-6xl sm:text-7xl" />
          <p className="mt-1 font-mono text-sm text-white/70">Linkwave (members only), every Sports+ game, UBusiness Ultimate, +25% XP. 40 ZX Cash a month.</p>
        </div>
        <span className="relative rounded-full border border-white/30 px-5 py-2 font-mono text-sm font-bold uppercase tracking-widest transition-colors group-hover:border-[#22e5ff] group-hover:text-[#22e5ff]">
          Get linked →
        </span>
      </Link>
    </section>
  );
}
