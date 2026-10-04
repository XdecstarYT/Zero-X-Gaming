import Link from "next/link";
import { GAMES } from "@/lib/catalog";

/** An endless ticker of every game under the hero (doubled so the loop is seamless; the copy is hidden from screen readers). */
export function GameTicker() {
  const live = GAMES.filter((g) => g.status === "live");
  const row = (copy: boolean) =>
    live.map((g) => (
      <li key={`${copy}-${g.slug}`} className="flex items-center" aria-hidden={copy || undefined}>
        <Link
          href={`/games/${g.slug}`}
          // A dozen game pages all in view: don't fetch them all up front.
          prefetch={false}
          tabIndex={copy ? -1 : undefined}
          className="px-6 font-display text-2xl font-black uppercase tracking-tight text-text/80 transition-colors hover:text-cyan sm:text-4xl"
        >
          {g.title}
        </Link>
        <span className="text-xl text-magenta sm:text-2xl" aria-hidden>
          ✦
        </span>
      </li>
    ));
  return (
    <nav aria-label="All games" className="zx-marquee-wrap relative overflow-hidden border-y border-border/70 py-4 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <ul className="zx-marquee">
        {row(false)}
        {row(true)}
      </ul>
    </nav>
  );
}
