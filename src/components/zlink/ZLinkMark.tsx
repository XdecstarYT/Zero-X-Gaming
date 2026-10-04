import { cn } from "@/lib/cn";

/** The ZLink+ mark: a glitching word and a breathing plus. */
export function ZLinkMark({ className, plusTestId }: { className?: string; plusTestId?: string }) {
  return (
    <span className={cn("inline-flex items-start font-display font-black uppercase leading-none tracking-tighter", className)}>
      <span className="zx-glitch" data-text="ZLink">
        ZLink
      </span>
      <span className="zx-pulse-plus ml-[0.04em] inline-block bg-gradient-to-br from-cyan via-violet to-magenta bg-clip-text text-transparent" data-testid={plusTestId}>
        +
      </span>
    </span>
  );
}
