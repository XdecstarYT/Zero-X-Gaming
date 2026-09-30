"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActive } from "./Navbar";

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  "/games": (
    <>
      <rect x="2.5" y="7" width="19" height="11" rx="4" />
      <path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5h.01M18 13.5h.01" />
    </>
  ),
  "/battle-pass": <path d="M12 3.5 14.6 9l6 .6-4.5 4 1.3 5.9L12 16.5l-5.4 3 1.3-5.9-4.5-4 6-.6z" />,
  "/leaderboards": <path d="M8 21V11M12 21V4M16 21v-7M4 21h16" />,
  "/profile": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};

const TABS = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/battle-pass", label: "Pass" },
  { href: "/leaderboards", label: "Ranks" },
  { href: "/profile", label: "Profile" },
];

/** Phone navigation: thumb-reachable tab bar, respecting the home-indicator safe area. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-cyan" : "text-muted active:text-text",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {ICONS[t.href]}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
