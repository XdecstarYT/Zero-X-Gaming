import { NextXMark } from "@/components/nextx/NextXLogo";

/** "Powered by NextX Engine": the mark the NextX titles carry on their title screens. Links to the NextX app. */
export function PoweredBy({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <a
      href="/nextx"
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 6px", borderRadius: 999, background: "rgba(6,6,20,.55)", border: "1px solid rgba(138,92,255,.55)", color: "#fff", fontSize: 11, fontWeight: 750, letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "none", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", whiteSpace: "nowrap", ...style }}
      data-testid="nextx-powered"
    >
      <NextXMark className="h-5 w-5" title="" />
      <span>
        Powered by <b style={{ background: "linear-gradient(120deg,#ff2bd6,#8a5cff,#22e5ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>NextX Engine</b>
      </span>
    </a>
  );
}
