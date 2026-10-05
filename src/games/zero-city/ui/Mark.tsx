import { GAME_NAME } from "../config";

/**
 * The mark: four rounded tiles in a 2 × 2 block (a city block seen from
 * above), one in the accent colour. Animated, the tiles shuffle and tilt.
 */
export function Mark({ size = 64, animated = false }: { size?: number; animated?: boolean }) {
  const tiles = [
    { x: 4, y: 4, fill: "#f4f7fb", cls: "zc-t0" },
    { x: 34, y: 4, fill: "var(--zc-accent)", cls: "zc-t1" },
    { x: 4, y: 34, fill: "#9fb0c4", cls: "zc-t2" },
    { x: 34, y: 34, fill: "#f4f7fb", cls: "zc-t3" },
  ];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={animated ? "zc-mark" : undefined} aria-hidden>
      {tiles.map((t) => (
        <rect key={t.cls} className={`zc-tile ${t.cls}`} x={t.x} y={t.y} width={26} height={26} rx={8} fill={t.fill} />
      ))}
    </svg>
  );
}

/** Mark plus the game's name. */
export function Logo({ size = 40 }: { size?: number }) {
  const [a, ...rest] = GAME_NAME.split(" ");
  return (
    <div className="flex items-center gap-3" aria-label={GAME_NAME}>
      <Mark size={size} />
      <div className="leading-none" aria-hidden>
        <div className="zc-h" style={{ fontSize: size * 0.48, letterSpacing: "0.12em" }}>
          {a.toUpperCase()}
        </div>
        {rest.length > 0 && (
          <div className="zc-h" style={{ fontSize: size * 0.48, letterSpacing: "0.12em", color: "var(--zc-accent)" }}>
            {rest.join(" ").toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}
