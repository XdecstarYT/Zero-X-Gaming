import { cn } from "@/lib/cn";

/**
 * The NextX mark: a chrome "N" whose last stroke shoots through into an "X", inside a hexagon
 * with an orbiting ring of light. `animate` draws it in (for the app's intro); it holds still
 * for people who prefer less motion.
 */
export function NextXMark({ className, animate = false, title = "NextX" }: { className?: string; animate?: boolean; title?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn("nx-mark", animate && "nx-animate", className)} {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}>
      <defs>
        <linearGradient id="nx-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9d4ff" />
          <stop offset="0.55" stopColor="#7b8cff" />
          <stop offset="1" stopColor="#e8ecff" />
        </linearGradient>
        <linearGradient id="nx-heat" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff2bd6" />
          <stop offset="0.5" stopColor="#8a5cff" />
          <stop offset="1" stopColor="#22e5ff" />
        </linearGradient>
        <radialGradient id="nx-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8a5cff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
        </radialGradient>
        <filter id="nx-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#nx-core)" />
      {/* The hexagon. */}
      <path className="nx-hex" d="M60 8 105 34v52L60 112 15 86V34z" fill="#07081a" stroke="url(#nx-heat)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 17 97 38.5v43L60 103 23 81.5v-43z" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      {/* The orbit. */}
      <g className="nx-orbit">
        <ellipse cx="60" cy="60" rx="54" ry="18" fill="none" stroke="url(#nx-heat)" strokeWidth="1.6" strokeDasharray="6 10" opacity="0.8" transform="rotate(-24 60 60)" />
        <circle cx="111" cy="47" r="3" fill="#22e5ff" filter="url(#nx-glow)" transform="rotate(-24 60 60)" />
      </g>
      {/* N and X. */}
      <g filter="url(#nx-glow)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path className="nx-n" d="M38 82V38l30 44V38" stroke="url(#nx-chrome)" strokeWidth="8" />
        <path className="nx-x" d="M62 38 88 82M88 38 62 82" stroke="url(#nx-heat)" strokeWidth="7" />
      </g>
    </svg>
  );
}

/** The mark and the wordmark together. */
export function NextXLogo({ className, size = "md", animate = false }: { className?: string; size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const mark = size === "lg" ? "h-24 w-24 sm:h-32 sm:w-32" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const word = size === "lg" ? "text-5xl sm:text-7xl" : size === "sm" ? "text-lg" : "text-2xl";
  return (
    <span className={cn("inline-flex items-center gap-3", size === "lg" && "flex-col gap-4", className)} role="img" aria-label="NextX">
      <NextXMark className={mark} animate={animate} title="" />
      <span className={cn("nx-word font-display font-black uppercase leading-none tracking-[0.08em]", word, animate && "nx-word-in")}>
        Next<span className="nx-word-x">X</span>
      </span>
    </span>
  );
}
