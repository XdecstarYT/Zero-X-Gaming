import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Section({
  title,
  eyebrow,
  href,
  hrefLabel = "See all",
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("mx-auto max-w-7xl px-4 sm:px-6", className)}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-magenta">{eyebrow}</p>}
          <h2 id={id} className="font-display text-xl font-bold uppercase tracking-wide sm:text-2xl">
            {title}
          </h2>
        </div>
        {href && (
          <Link href={href} className="shrink-0 text-sm font-semibold text-cyan hover:underline">
            {hrefLabel} <span aria-hidden>→</span>
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
