import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Section({
  title,
  eyebrow,
  href,
  hrefLabel = "See all",
  index,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
  /** A big outlined number beside the heading (01, 02, ...). */
  index?: number;
  children: ReactNode;
  className?: string;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("mx-auto max-w-7xl px-4 sm:px-6", className)}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          {index !== undefined && (
            <span className="zx-outline zx-reveal hidden font-display text-6xl font-black leading-none sm:block lg:text-7xl" aria-hidden>
              {String(index).padStart(2, "0")}
            </span>
          )}
          <div>
            {eyebrow && (
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-magenta">
                <span className="h-px w-6 bg-gradient-to-r from-magenta to-transparent" aria-hidden />
                {eyebrow}
              </p>
            )}
            <h2 id={id} className="mt-1 font-display text-2xl font-black uppercase tracking-tight sm:text-3xl">
              {title}
            </h2>
          </div>
        </div>
        {href && (
          <Link href={href} className="group/see shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-cyan transition-colors hover:border-cyan">
            {hrefLabel} <span aria-hidden className="inline-block transition-transform group-hover/see:translate-x-1">→</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Responsive card grid: horizontal snap-scroll on phones, grid from sm up. */
export function CardRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="zx-scroll-row -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4"
    >
      {children}
    </ul>
  );
}

export function CardRowItem({ children }: { children: ReactNode }) {
  return <li className="w-[72vw] max-w-72 shrink-0 snap-start sm:w-auto sm:max-w-none">{children}</li>;
}
