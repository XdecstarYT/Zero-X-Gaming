"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { AccountControl } from "./AccountControl";
import { CoinChip } from "@/components/shop/Coin";
import { OwnerLink } from "@/components/owner/OwnerLink";
import { CommandPalette } from "./CommandPalette";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/sports", label: "Sports+" },
  { href: "/battle-pass", label: "Battle Pass", short: "Pass" },
  { href: "/shop", label: "Item Shop", short: "Shop" },
  { href: "/leaderboards", label: "Leaderboards", short: "Ranks" },
  { href: "/profile", label: "Profile" },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-cyan focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="zx-glass mx-auto flex h-14 max-w-7xl items-center gap-3 rounded-2xl border border-border/70 px-3 shadow-[0_10px_40px_-18px_rgb(0_0_0/0.7)] sm:h-16 sm:px-5 xl:gap-6">
        <Link href="/" aria-label="Zero X Gaming home" className="shrink-0 rounded-md">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              // The logo and the avatar already go home and to your profile; their links only show with room to spare.
              <li key={l.href} className={l.href === "/" || l.href === "/profile" ? "hidden xl:block" : undefined}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-full px-2 py-1.5 text-sm font-semibold transition-colors xl:px-3",
                    active ? "bg-surface-3/80 text-text" : "text-muted hover:bg-surface-2/70 hover:text-text",
                  )}
                >
                  {"short" in l ? (
                    <>
                      <span className="hidden xl:inline">{l.label}</span>
                      <span className="xl:hidden" aria-hidden>
                        {l.short}
                      </span>
                      <span className="sr-only xl:hidden">{l.label}</span>
                    </>
                  ) : (
                    l.label
                  )}
                  {active && (
                    <span
                      className="absolute inset-x-4 -bottom-1 h-0.5 rounded-full bg-gradient-to-r from-cyan via-violet to-magenta"
                      aria-hidden
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <CommandPalette />
          <div className="md:max-lg:hidden">
            <CoinChip />
          </div>
          <OwnerLink />
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className="hidden h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text sm:grid"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </Link>
          <div className="hidden md:block">
            <AccountControl />
          </div>
          <div className="md:hidden">
            <AccountControl variant="compact" />
          </div>
        </div>
      </nav>
    </header>
  );
}
