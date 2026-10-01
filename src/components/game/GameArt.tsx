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
      {game.slug === "trenches" ? (
        <Trenches id={id} a={a} b={b} />
      ) : game.slug === "code-3" ? (
        <Code3 id={id} a={a} b={b} />
      ) : game.category === "sports" ? (
        <Oval id={id} a={a} b={b} />
      ) : (
        <Motif category={game.category} id={id} a={a} b={b} />
      )}
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

/** Night street: skyline, wet road, a cruiser with its light bar going. */
function Code3({ id, a, b }: { id: string; a: string; b: string }) {
  const towers = [
    [0, 70, 34], [30, 52, 26], [52, 84, 30], [80, 40, 22], [100, 64, 36], [134, 30, 26], [158, 58, 30], [186, 76, 24],
    [208, 46, 34], [240, 66, 28], [266, 38, 30], [294, 60, 26],
  ];
  return (
    <g>
      <rect width="320" height="200" fill="#05070f" />
      <circle cx="80" cy="120" r="70" fill={b} fillOpacity="0.35" filter={`url(#${id}-blur)`} />
      <circle cx="220" cy="120" r="70" fill={a} fillOpacity="0.35" filter={`url(#${id}-blur)`} />
      {towers.map(([x, top, w], i) => (
        <g key={i}>
          <rect x={x} y={top} width={w} height={140 - top} fill="#0d1322" />
          {Array.from({ length: Math.floor((140 - top) / 12) }, (_, r) =>
            Array.from({ length: Math.floor(w / 9) }, (_, c) =>
              (r * 7 + c * 3 + i) % 4 === 0 ? (
                <rect key={`${r}-${c}`} x={x + 3 + c * 9} y={top + 5 + r * 12} width="4" height="5" fill="#ffcf8a" fillOpacity="0.7" />
              ) : null,
            ),
          )}
        </g>
      ))}
      {/* road */}
      <path d="M0 140h320v60H0z" fill="#10141c" />
      <path d="M0 168h320" stroke="#e2b83a" strokeWidth="2" strokeDasharray="18 12" opacity="0.7" />
      {/* cruiser */}
      <g transform="translate(96 124)">
        <path d="M6 30h116l-4-14-22-4-14-12H42L26 12 8 16z" fill="#0b0d12" />
        <path d="M44 3h26l12 10H34z" fill="#1e2a3a" />
        <rect x="40" y="16" width="44" height="12" fill="#e8ebef" />
        <rect x="46" y="-4" width="14" height="6" rx="1" fill={b} />
        <rect x="62" y="-4" width="14" height="6" rx="1" fill={a} />
        <circle cx="30" cy="31" r="8" fill="#050608" stroke="#555" strokeWidth="2" />
        <circle cx="98" cy="31" r="8" fill="#050608" stroke="#555" strokeWidth="2" />
        <rect x="116" y="18" width="6" height="4" fill="#fff4d0" />
      </g>
      <ellipse cx="148" cy="120" rx="36" ry="14" fill={b} fillOpacity="0.55" filter={`url(#${id}-blur)`} />
      <ellipse cx="176" cy="120" rx="36" ry="14" fill={a} fillOpacity="0.55" filter={`url(#${id}-blur)`} />
      {/* reflections on the wet road */}
      <rect x="140" y="160" width="14" height="36" fill={b} fillOpacity="0.25" filter={`url(#${id}-blur)`} />
      <rect x="160" y="160" width="14" height="36" fill={a} fillOpacity="0.25" filter={`url(#${id}-blur)`} />
    </g>
  );
}

/** Floodlit oval, goal posts and a footy on the way through. */
function Oval({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <g>
      <ellipse cx="160" cy="150" rx="170" ry="58" fill="#1f5a2a" />
      <ellipse cx="160" cy="150" rx="150" ry="48" fill="#2a7334" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={20 + i * 50} y="100" width="25" height="100" fill="#fff" opacity="0.035" />
      ))}
      <ellipse cx="160" cy="150" rx="150" ry="48" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
      <rect x="146" y="142" width="28" height="16" fill="none" stroke="#fff" strokeOpacity=".6" />
      <circle cx="160" cy="150" r="3" fill="none" stroke="#fff" strokeOpacity=".6" />
      <path d="M36 128 Q70 150 36 172 M284 128 Q250 150 284 172" fill="none" stroke="#fff" strokeOpacity=".45" />
      {/* posts at the far end: behind, goal, goal, behind */}
      {[
        [248, 90, 1.3],
        [258, 70, 2],
        [272, 70, 2],
        [282, 90, 1.3],
      ].map(([x, y, w]) => (
        <line key={x} x1={x} y1={y} x2={x} y2={124} stroke="#fff" strokeWidth={w} />
      ))}
      {[30, 290].map((x) => (
        <g key={x}>
          <line x1={x} y1="14" x2={x} y2="96" stroke="#9aa3b5" strokeWidth="2" />
          <rect x={x - 12} y="8" width="24" height="10" rx="2" fill="#fff" />
          <path d={`M${x - 12} 18 L${x - 70} 200 L${x + 70} 200 L${x + 12} 18 Z`} fill="#fff" opacity=".05" filter={`url(#${id}-blur)`} />
        </g>
      ))}
      <path d="M110 120 Q180 30 262 78" fill="none" stroke={a} strokeOpacity=".6" strokeDasharray="4 5" strokeWidth="2" />
      <ellipse cx="236" cy="62" rx="11" ry="7" transform="rotate(-25 236 62)" fill="#b3261e" stroke="#fff" strokeOpacity=".7" />
      <g transform="translate(100 104)">
        <circle cx="0" cy="-18" r="5" fill="#e8c4a0" />
        <path d="M-7 -12 h14 l2 14 h-18 z" fill={a} />
        <path d="M-7 -12 h14 l2 14 h-18 z" fill="none" stroke={b} strokeWidth="2" />
        <path d="M-5 2 l-4 16 M5 2 l14 8" stroke="#1b1b1b" strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
}
