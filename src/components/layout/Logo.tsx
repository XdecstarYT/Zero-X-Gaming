import { cn } from "@/lib/cn";

/** The signature "X" mark. Two crossing neon bars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id="zx-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--zx-cyan)" />
          <stop offset="1" stopColor="var(--zx-magenta)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0c0f1c" stroke="url(#zx-mark)" strokeWidth="1.5" />
      <path d="M9 9 L23 23" stroke="var(--zx-cyan)" strokeWidth="4" strokeLinecap="square" />
      <path d="M23 9 L9 23" stroke="var(--zx-magenta)" strokeWidth="4" strokeLinecap="square" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-base font-black uppercase tracking-[0.18em]">
        Zero <span className="text-magenta">X</span>
        <span className="ml-2 hidden text-muted sm:inline md:hidden xl:inline">| Gaming</span>
      </span>
    </span>
  );
}
