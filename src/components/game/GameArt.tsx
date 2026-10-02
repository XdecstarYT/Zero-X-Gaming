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
      ) : game.slug === "diamond-derby" ? (
        <Diamond id={id} a={a} b={b} />
      ) : game.slug === "ace-rally" ? (
        <Court id={id} a={a} b={b} />
      ) : game.slug === "life" ? (
        <LifeArt a={a} b={b} />
      ) : game.slug === "boundary-blitz" ? (
        <Cricket a={a} b={b} />
      ) : game.slug === "clanforge" ? (
        <Village a={a} b={b} />
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

/** A floodlit ballpark from behind the plate: the diamond, the wall, a ball on its way out. */
function Diamond({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <g>
      <path d="M-10 118 Q160 60 330 118 L330 200 L-10 200 Z" fill="#1f5a2a" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path key={i} d={`M${-10 + i * 50} 200 L${60 + i * 30} 100 L${80 + i * 30} 100 L${20 + i * 50} 200 Z`} fill="#fff" opacity="0.035" />
      ))}
      <path d="M-10 118 Q160 60 330 118" fill="none" stroke="#14532d" strokeWidth="10" />
      <path d="M-10 113 Q160 55 330 113" fill="none" stroke="#facc15" strokeWidth="1.5" />
      <path d="M160 196 L250 150 L160 118 L70 150 Z" fill="#a0673f" />
      <path d="M160 188 L232 150 L160 126 L88 150 Z" fill="#2a7334" />
      <ellipse cx="160" cy="146" rx="12" ry="5" fill="#a0673f" />
      {[
        [250, 150],
        [160, 118],
        [70, 150],
      ].map(([x, y]) => (
        <rect key={x} x={x - 3} y={y - 2} width="6" height="4" fill="#fff" />
      ))}
      <path d="M160 196 L330 120 M160 196 L-10 120" stroke="#fff" strokeOpacity=".6" strokeWidth="1.2" />
      {[40, 280].map((x) => (
        <g key={x}>
          <line x1={x} y1="14" x2={x} y2="90" stroke="#9aa3b5" strokeWidth="2" />
          <rect x={x - 12} y="8" width="24" height="10" rx="2" fill="#fff" />
          <path d={`M${x - 12} 18 L${x - 70} 200 L${x + 70} 200 L${x + 12} 18 Z`} fill="#fff" opacity=".05" filter={`url(#${id}-blur)`} />
        </g>
      ))}
      <path d="M150 180 Q200 30 268 46" fill="none" stroke="#ffd84a" strokeWidth="2" strokeDasharray="5 4" />
      <circle cx="268" cy="46" r="4.5" fill="#f3f1ea" stroke={a} strokeWidth="1" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} x1="268" y1="46" x2={268 + Math.cos((i / 8) * Math.PI * 2) * 14} y2={46 + Math.sin((i / 8) * Math.PI * 2) * 14} stroke={b === "#13284d" ? "#fca5a5" : b} strokeOpacity=".7" strokeWidth="1.2" />
      ))}
      <g transform="translate(140 168)">
        <circle cx="0" cy="-20" r="5" fill="#c68c5d" />
        <path d="M-6 -15 h12 l2 15 h-16 z" fill={b} />
        <path d="M-4 0 l-3 18 M4 0 l4 18" stroke="#e9e7e1" strokeWidth="4" strokeLinecap="round" />
        <path d="M6 -14 L26 -34" stroke="#c79a5b" strokeWidth="3" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Centre Court from the broadcast camera: the lines, the net, a serve at full stretch. */
function Court({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <g>
      <rect x="0" y="70" width="320" height="130" fill="#3c7a52" />
      <path d="M90 78 L230 78 L290 196 L30 196 Z" fill="#2f5f9e" />
      <path d="M90 78 L230 78 L290 196 L30 196 Z" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.5" />
      <path d="M106 78 L74 196 M214 78 L246 196" stroke="#fff" strokeOpacity=".7" />
      <path d="M100 104 L220 104 M64 160 L256 160 M160 104 L160 160" stroke="#fff" strokeOpacity=".7" />
      <path d="M58 128 L262 128" stroke="#e5e7eb" strokeWidth="3" />
      <path d="M58 128 L58 116 M262 128 L262 116 M58 117 L262 117" stroke="#1f2937" strokeWidth="1.5" />
      <rect x="58" y="117" width="204" height="11" fill="#111827" opacity=".35" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={i * 40} y="40" width="40" height="30" fill={i % 2 ? "#1e2f5a" : "#24376a"} />
      ))}
      <rect x="0" y="64" width="320" height="6" fill={a} opacity=".8" />
      <g transform="translate(150 182)">
        <circle cx="0" cy="-40" r="5" fill="#c68c5d" />
        <path d="M-6 -35 h12 l2 18 h-16 z" fill="#f8fafc" />
        <path d="M-4 -17 l-3 17 M4 -17 l4 17" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
        <path d="M5 -33 L14 -60" stroke="#c68c5d" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="17" cy="-68" rx="5" ry="7" fill="none" stroke="#111827" strokeWidth="2" />
      </g>
      <circle cx="176" cy="96" r="3.5" fill="#d8ea3a" />
      <path d="M170 104 Q174 98 176 96" stroke="#d8ea3a" strokeOpacity=".6" fill="none" />
      <path d={`M176 96 L120 ${80}`} stroke={b} strokeOpacity=".35" strokeDasharray="3 4" filter={`url(#${id}-blur)`} />
    </g>
  );
}

function Village({ a, b }: { a: string; b: string }) {
  // An isometric village: a walled Keep on a grassy diamond, a cannon, a mine, a drake overhead.
  const iso = (x: number, y: number) => `${160 + (x - y) * 14} ${112 + (x + y) * 7}`;
  return (
    <g>
      <path d={`M${iso(-6, -6)} L${iso(6, -6)} L${iso(6, 6)} L${iso(-6, 6)} Z`} fill="#3f7d3a" />
      <path d={`M${iso(-6, 6)} L${iso(6, 6)} L${iso(6, 6)} l0 10 L${iso(-6, 6)} Z`} fill="#2a5426" />
      <path d={`M${iso(-3, -3)} L${iso(3, -3)} L${iso(3, 3)} L${iso(-3, 3)} Z`} fill="none" stroke="#a8a29e" strokeWidth="5" strokeLinejoin="round" />
      <g transform="translate(160 106)">
        <path d="M-16 0 L-16 -30 L16 -30 L16 0 L0 9 Z" fill="#78716c" />
        <path d="M0 9 L16 0 L16 -30 L0 -22 Z" fill="#57534e" />
        <path d="M-18 -30 L0 -40 L18 -30 L0 -21 Z" fill={a} />
        <path d="M0 -40 L0 -60" stroke="#e7e5e4" strokeWidth="1.5" />
        <path d="M0 -60 L14 -55 L0 -50 Z" fill={b} />
      </g>
      <g transform={`translate(${iso(4.5, -1.5)})`}>
        <ellipse cx="0" cy="0" rx="10" ry="5" fill="#44403c" />
        <path d="M-2 -6 L14 -12" stroke="#1c1917" strokeWidth="5" strokeLinecap="round" />
        <circle cx="0" cy="-5" r="5" fill="#292524" />
      </g>
      <g transform={`translate(${iso(-4.5, 1.5)})`}>
        <path d="M-10 0 L0 -12 L10 0 L0 5 Z" fill="#92400e" />
        <circle cx="0" cy="-16" r="5" fill="#facc15" />
      </g>
      <g transform="translate(250 48)" fill={b}>
        <path d="M-18 0 Q0 -6 18 0 Q4 4 -18 0 Z" />
        <path d="M-4 -2 L-14 -22 L4 -4 Z M2 -2 L16 -20 L8 -2 Z" opacity=".85" />
        <path d="M18 0 L26 -3 L24 3 Z" />
        <path d="M26 0 Q40 4 46 14" stroke="#fb923c" strokeWidth="4" fill="none" opacity=".8" />
      </g>
    </g>
  );
}

function Cricket({ a, b }: { a: string; b: string }) {
  // Under lights: the pitch running away, stumps flying, a white ball heading for the rope.
  return (
    <g>
      <ellipse cx="160" cy="200" rx="230" ry="120" fill="#1f5f2c" />
      <ellipse cx="160" cy="200" rx="200" ry="100" fill="none" stroke="#f8fafc" strokeOpacity=".5" strokeDasharray="3 6" />
      <path d="M146 92 L174 92 L196 200 L124 200 Z" fill="#c9b27a" />
      <path d="M140 172 L180 172" stroke="#fff" strokeWidth="2" />
      <g stroke="#f1ead6" strokeWidth="4" strokeLinecap="round">
        <path d="M150 196 L148 160" />
        <path d="M160 196 L164 158" />
        <path d="M170 196 L176 162" />
      </g>
      <path d="M142 152 l12 -6" stroke={b} strokeWidth="3" strokeLinecap="round" />
      <path d="M170 150 l14 -2" stroke={b} strokeWidth="3" strokeLinecap="round" />
      {[40, 90, 230, 280].map((x) => (
        <g key={x}>
          <path d={`M${x} 70 L${x} 18`} stroke="#9aa1aa" strokeWidth="3" />
          <rect x={x - 10} y="10" width="20" height="9" fill="#fff8e0" />
          <circle cx={x} cy="14" r="16" fill="#fff6d8" opacity=".25" />
        </g>
      ))}
      <path d="M160 120 Q220 30 300 40" stroke={a} strokeOpacity=".7" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
      <circle cx="300" cy="40" r="5" fill="#fff" />
    </g>
  );
}

function LifeArt({ a, b }: { a: string; b: string }) {
  // A sunrise over a street of houses, a phone with your life on it.
  return (
    <g>
      <rect width="320" height="200" fill="#0b3b2e" />
      <circle cx="250" cy="70" r="34" fill={b} opacity=".85" />
      <path d="M0 120 Q80 96 160 112 T320 104 L320 200 L0 200 Z" fill="#14532d" />
      {[20, 95, 170].map((x, i) => (
        <g key={x}>
          <rect x={x} y={118 - i * 2} width="60" height="38" fill="#f5f5f4" />
          <path d={`M${x - 6} ${118 - i * 2} L${x + 30} ${96 - i * 2} L${x + 66} ${118 - i * 2} Z`} fill={["#7c2d12", "#374151", "#4b3a2f"][i]} />
          <rect x={x + 24} y={134 - i * 2} width="12" height="22" fill="#78350f" />
          <rect x={x + 6} y={126 - i * 2} width="12" height="10" fill="#93c5fd" />
          <rect x={x + 42} y={126 - i * 2} width="12" height="10" fill="#93c5fd" />
        </g>
      ))}
      <rect x="0" y="160" width="320" height="40" fill="#3f3f46" />
      <path d="M0 180 L320 180" stroke="#f8fafc" strokeDasharray="14 10" strokeWidth="2" />
      <g transform="translate(244 96) rotate(8)">
        <rect x="0" y="0" width="54" height="96" rx="9" fill="#0f172a" />
        <rect x="4" y="8" width="46" height="80" rx="4" fill="#f8fafc" />
        <rect x="8" y="14" width="38" height="5" rx="2" fill={a} />
        <rect x="8" y="23" width="30" height="4" rx="2" fill="#ef4444" />
        <rect x="8" y="30" width="26" height="4" rx="2" fill="#3b82f6" />
        <rect x="8" y="37" width="34" height="4" rx="2" fill="#ec4899" />
        <rect x="8" y="70" width="38" height="12" rx="4" fill={a} />
      </g>
    </g>
  );
}
