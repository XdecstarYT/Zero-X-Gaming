import Link from "next/link";
import { UPDATES } from "@/lib/updates";

/** The latest updates, newest first, each a link into the game. */
export function WhatsNew() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="whats-new">
      {UPDATES.map((u) => (
        <li key={u.title}>
          <Link href={u.href} className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 transition hover:border-cyan">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-magenta">{u.tag}</span>
            <span className="font-display text-base font-bold uppercase">{u.title}</span>
            <span className="text-sm text-muted">{u.body}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
