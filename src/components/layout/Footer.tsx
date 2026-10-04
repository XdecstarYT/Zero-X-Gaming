import Link from "next/link";
import { Logo } from "./Logo";
import { GAMES } from "@/lib/catalog";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Play",
    links: [
      { href: "/games", label: "All games" },
      { href: "/games?sort=new", label: "New releases" },
      { href: "/sports", label: "Sports+" },
      { href: "/leaderboards", label: "Leaderboards" },
    ],
  },
  {
    title: "Earn",
    links: [
      { href: "/battle-pass", label: "Battle Pass" },
      { href: "/shop", label: "Item Shop" },
      { href: "/locker", label: "Locker" },
      { href: "/profile", label: "Your profile" },
    ],
  },
  {
    title: "Popular",
    links: GAMES.filter((g) => ["life", "ubusiness", "hometown", "trenches"].includes(g.slug)).map((g) => ({
      href: `/games/${g.slug}`,
      label: g.title,
    })),
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            {GAMES.length} original web games. No downloads. Just play, on your phone or your desktop.
          </p>
          <Link href="/settings" className="mt-4 inline-block text-sm text-muted hover:text-text">
            Settings →
          </Link>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-subtle">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link className="hover:text-text" href={l.href}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="overflow-hidden" aria-hidden>
        <p className="zx-outline -mb-[2.2vw] select-none whitespace-nowrap text-center font-display text-[19vw] font-black uppercase leading-none tracking-tighter transition-colors duration-700 hover:text-surface-3">
          Zero X
        </p>
      </div>
      <p className="border-t border-border/60 py-6 text-center text-xs text-subtle">© {new Date().getFullYear()} Zero X | Gaming</p>
    </footer>
  );
}
