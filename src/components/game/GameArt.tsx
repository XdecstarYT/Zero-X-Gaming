import type { Game } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Procedural cover art so the hub ships with zero image payload.
 * Each category gets its own motif, tinted with the game's palette.
 */
export function GameArt({
  game,
  className,
}: {
  game: Pick<Game, "slug" | "category" | "palette">;
  className?: string;
}) {
  const [a, b] = game.palette;
  const id = `art-${game.slug}`;

  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block h-full w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a0c18" />
          <stop offset="1" stopColor="#141833" />
        </linearGradient>
        <linearGradient id={`${id}-ab`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.7" cy="0.35" r="0.6">
          <stop offset="0" stopColor={b} stopOpacity="0.45" />
          <stop offset="1" stopColor={b} stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      <rect width="320" height="200" fill={`url(#${id}-glow)`} />
      {game.slug === "trenches" ? <Trenches id={id} a={a} b={b} /> : <Motif category={game.category} id={id} a={a} b={b} />}
    </svg>
  );
}

function Motif({ category, id, a, b }: { category: Game["category"]; id: string; a: string; b: string }) {
  const stroke = `url(#${id}-ab)`;
  switch (category) {
    case "runner":
      return (
        <g>
          {/* perspective floor */}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={160} y1={110} x2={-80 + i * 60} y2={200} stroke={a} strokeOpacity="0.35" />
          ))}
          {[120, 135, 155, 180].map((y) => (
            <line key={y} x1={0} y1={y} x2={320} y2={y} stroke={a} strokeOpacity="0.25" />
          ))}
          <line x1="0" y1="110" x2="320" y2="110" stroke={stroke} strokeWidth="2" />
          {/* runner */}
          <g filter={`url(#${id}-blur)`} opacity="0.8">
            <rect x="140" y="62" width="26" height="26" rx="4" fill={b} />
          </g>
          <rect x="140" y="62" width="26" height="26" rx="4" fill="none" stroke={stroke} strokeWidth="3" />
          <path d="M92 76h36M72 84h40M100 92h28" stroke={a} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case "puzzle":
      return (
        <g transform="translate(88 28)">
          {Array.from({ length: 16 }, (_, i) => {
            const x = (i % 4) * 38;
            const y = Math.floor(i / 4) * 38;
            const lit = [1, 5, 9, 6, 7, 14].includes(i);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width="32"
                height="32"
                rx="6"
                fill={lit ? (i % 2 ? a : b) : "#1b2038"}
                fillOpacity={lit ? 0.9 : 1}
                stroke={lit ? "white" : "#262c4a"}
                strokeOpacity={lit ? 0.4 : 1}
              />
            );
          })}
        </g>
      );
    case "arcade":
      return (
        <g>
          <circle cx="170" cy="105" r="30" fill={a} fillOpacity="0.9" />
          <ellipse
            cx="170"
            cy="105"
            rx="92"
            ry="34"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            transform="rotate(-18 170 105)"
          />
          <ellipse
            cx="170"
            cy="105"
            rx="130"
            ry="54"
            fill="none"
            stroke={b}
            strokeOpacity="0.4"
            transform="rotate(-18 170 105)"
          />
          <circle cx="252" cy="78" r="6" fill={b} />
          <circle cx="68" cy="140" r="4" fill={a} />
          {[
            [40, 30],
            [280, 160],
            [110, 40],
            [230, 30],
            [300, 60],
            [30, 180],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="white" opacity="0.7" />
          ))}
        </g>
      );
    case "shooter":
      return (
        <g>
          {/* corridor in perspective */}
          <path
            d="M0 0 L120 70 L200 70 L320 0 M0 200 L120 130 L200 130 L320 200"
            stroke={a}
            strokeOpacity="0.5"
            fill="none"
          />
          <rect x="120" y="70" width="80" height="60" fill="none" stroke={b} strokeOpacity="0.6" />
          {[30, 60, 90].map((d) => (
            <g key={d} stroke={a} strokeOpacity="0.25">
              <line x1={d * 1.33} y1={d * 0.78} x2={d * 1.33} y2={200 - d * 0.78} />
              <line x1={320 - d * 1.33} y1={d * 0.78} x2={320 - d * 1.33} y2={200 - d * 0.78} />
            </g>
          ))}
          {/* drone */}
          <circle cx="178" cy="98" r="9" fill={a} />
          <rect x="170" y="106" width="16" height="16" fill={a} fillOpacity="0.6" />
          {/* crosshair */}
          <g stroke={b} strokeWidth="3" filter={`url(#${id}-blur)`}>
            <circle cx="160" cy="100" r="22" fill="none" />
          </g>
          <g stroke={b} strokeWidth="2.5">
            <circle cx="160" cy="100" r="22" fill="none" />
            <line x1="160" y1="70" x2="160" y2="86" />
            <line x1="160" y1="114" x2="160" y2="130" />
            <line x1="130" y1="100" x2="146" y2="100" />
            <line x1="174" y1="100" x2="190" y2="100" />
          </g>
        </g>
      );
    case "trivia":
      return (
        <g>
          <text
            x="160"
            y="128"
            textAnchor="middle"
            fontSize="110"
            fontWeight="800"
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            fontFamily="sans-serif"
          >
            ?
          </text>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i % 2 ? 232 : 24}
              y={i < 2 ? 50 : 118}
              width="64"
              height="28"
              rx="6"
              fill="#1b2038"
              stroke={i === 1 ? a : "#3a4270"}
            />
          ))}
          <circle cx="160" cy="100" r="78" fill="none" stroke={b} strokeOpacity="0.3" strokeDasharray="4 6" />
        </g>
      );
  }
}

/** Trenches: a war-torn skyline at dusk, a trench parapet with wire and a flag. */
function Trenches({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <g>
      <rect width="320" height="200" fill={b} fillOpacity="0.25" />
      <circle cx="236" cy="72" r="26" fill={a} fillOpacity="0.55" filter={`url(#${id}-blur)`} />
      {/* distant smoke and artillery flashes */}
      <ellipse cx="70" cy="96" rx="60" ry="18" fill="#8a8578" fillOpacity="0.25" />
      <ellipse cx="190" cy="104" rx="80" ry="14" fill="#8a8578" fillOpacity="0.2" />
      <circle cx="120" cy="112" r="5" fill={a} opacity="0.8" filter={`url(#${id}-blur)`} />
      <circle cx="280" cy="116" r="4" fill={a} opacity="0.6" filter={`url(#${id}-blur)`} />
      {/* ruined farmhouse + dead trees */}
      <path d="M40 124 V100 L56 88 L64 96 V92 H70 V124 Z" fill="#1c1a16" />
      <path d="M262 124 V96 M262 104 L252 94 M262 100 L272 90" stroke="#1c1a16" strokeWidth="3" />
      <path d="M92 124 V106 M92 112 L86 104" stroke="#1c1a16" strokeWidth="2.5" />
      {/* no-man's land */}
      <path d="M0 124 Q80 118 160 124 T320 122 V200 H0 Z" fill="#2b2619" />
      {/* wire */}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} stroke="#6d6a60" strokeWidth="1.4" fill="none">
          <path d={`M${i * 42 + 6} 150 l10 -14 M${i * 42 + 16} 150 l-10 -14`} />
          <ellipse cx={i * 42 + 27} cy="142" rx="11" ry="5" />
        </g>
      ))}
      {/* flag */}
      <line x1="200" y1="150" x2="200" y2="92" stroke="#d8d2c0" strokeWidth="2" />
      <path d="M201 94 Q214 90 226 96 Q214 102 201 100 Z" fill={a} />
      {/* sandbag parapet */}
      <path d="M0 200 V168 Q160 150 320 166 V200 Z" fill="#3a3322" />
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx={i * 28 + 12} cy={166 - Math.sin(i / 2) * 3} rx="15" ry="7" fill="#7d6f4c" stroke="#4e4430" />
      ))}
    </g>
  );
}
