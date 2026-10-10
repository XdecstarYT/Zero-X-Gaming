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
      ) : game.slug === "fairway" ? (
        <Golf a={a} b={b} />
      ) : game.slug === "hometown" ? (
        <TownArt a={a} b={b} />
      ) : game.slug === "ubusiness" ? (
        <StoreArt a={a} b={b} />
      ) : game.slug === "linkwave" ? (
        <LinkArt />
      ) : game.slug === "zenith" ? (
        <CityArt id={id} />
      ) : game.slug === "zero-city" ? (
        <ZeroCityArt id={id} />
      ) : game.slug === "yourgov" ? (
        <YourGovArt />
      ) : game.slug === "wareforge" ? (
        <WareForgeArt />
      ) : game.slug === "lifeline" ? (
        <LifelineArt id={id} />
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

function Golf({ a, b }: { a: string; b: string }) {
  // Down the fairway at golden hour: bunkers, the green and the flag, a ball's arc dropping in.
  return (
    <g>
      <circle cx="250" cy="58" r="26" fill={b} opacity=".7" />
      <path d="M0 96 Q60 78 120 92 T240 84 T320 90 L320 200 L0 200 Z" fill="#14532d" />
      <path d="M0 110 Q90 96 170 108 T320 102 L320 200 L0 200 Z" fill="#166534" />
      <path d="M110 200 Q150 150 168 118 Q176 106 196 104 L230 104 Q214 120 210 150 Q206 180 230 200 Z" fill="#4d9a3a" />
      <path d="M128 200 Q158 160 172 128" stroke="#5fb049" strokeWidth="10" opacity=".6" fill="none" />
      <ellipse cx="208" cy="106" rx="34" ry="9" fill="#65b84c" />
      <ellipse cx="166" cy="114" rx="14" ry="4" fill="#e7d9ae" />
      <ellipse cx="250" cy="112" rx="12" ry="4" fill="#e7d9ae" />
      {[30, 60, 280, 300].map((x, i) => (
        <g key={x}>
          <rect x={x - 1.5} y={88 - (i % 2) * 6} width="3" height="16" fill="#3f2a1a" />
          <circle cx={x} cy={80 - (i % 2) * 6} r={13 - (i % 2) * 3} fill="#0f3d1e" />
        </g>
      ))}
      <path d="M212 106 L212 72" stroke="#f8fafc" strokeWidth="2" />
      <path d="M212 72 L232 78 L212 84 Z" fill={a} />
      <path d="M40 190 Q130 0 206 104" stroke="#fde68a" strokeOpacity=".85" strokeWidth="2.5" fill="none" />
      <circle cx="206" cy="104" r="3.5" fill="#fff" />
    </g>
  );
}

function TownArt({ a, b }: { a: string; b: string }) {
  // Dusk on a shared street: a shop, a house going up, a market ticker, a ballot box.
  return (
    <g>
      <rect width="320" height="200" fill="#1c1917" />
      <rect width="320" height="120" fill="#422006" opacity=".55" />
      <circle cx="60" cy="54" r="24" fill={b} opacity=".8" />
      <polyline points="150,70 175,58 198,64 222,40 246,48 270,26 300,32" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinejoin="round" />
      <path d="M296 26 L304 32 L294 36 Z" fill="#4ade80" />
      <rect x="18" y="98" width="86" height="62" fill="#f5f5f4" />
      <rect x="14" y="88" width="94" height="14" fill={a} />
      <text x="61" y="99" textAnchor="middle" fontFamily="Arial" fontWeight="900" fontSize="10" fill="#fff">
        SHOP
      </text>
      <rect x="28" y="112" width="30" height="22" fill="#93c5fd" />
      <rect x="68" y="118" width="22" height="42" fill="#78350f" />
      <g>
        <rect x="124" y="108" width="70" height="52" fill="#e7e5e4" />
        <path d="M118 108 L159 80 L200 108 Z" fill="#7c2d12" />
        <rect x="150" y="128" width="16" height="32" fill="#57534e" />
        <rect x="206" y="112" width="30" height="48" fill="none" stroke="#fbbf24" strokeWidth="3" strokeDasharray="5 4" />
      </g>
      <g transform="translate(250 112)">
        <rect x="0" y="12" width="48" height="36" rx="3" fill="#1e3a8a" />
        <rect x="14" y="10" width="20" height="4" fill="#0f172a" />
        <rect x="16" y="-6" width="16" height="20" fill="#f8fafc" transform="rotate(-8 24 4)" />
        <path d="M19 2 L23 7 L30 -2" stroke="#16a34a" strokeWidth="2.5" fill="none" transform="rotate(-8 24 4)" />
      </g>
      <rect x="0" y="160" width="320" height="40" fill="#3f3f46" />
      <path d="M0 180 L320 180" stroke="#f8fafc" strokeDasharray="14 10" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={128 + i * 14} cy={188 - (i % 2) * 2} r="6" fill={b} stroke="#78350f" strokeWidth="1.5" />
      ))}
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

function StoreArt({ a, b }: { a: string; b: string }) {
  // Evening on a corner store: lit windows, stocked shelves, an OPEN sign, a till and a trolley.
  return (
    <g>
      <rect width="320" height="200" fill="#0f172a" />
      <rect width="320" height="70" fill="#1e293b" />
      <rect x="20" y="28" width="280" height="132" fill="#e7e5e4" />
      <rect x="14" y="20" width="292" height="26" fill={a} />
      <text x="160" y="38" textAnchor="middle" fontFamily="Arial" fontWeight="900" fontSize="15" letterSpacing="3" fill="#fff">
        CORNER MART
      </text>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <path key={i} d={`M${20 + i * 35} 46 h35 l-4 12 h-27 Z`} fill={i % 2 ? "#f8fafc" : b} />
      ))}
      <rect x="34" y="66" width="168" height="80" fill="#fef9c3" />
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <rect x="40" y={84 + r * 22} width="156" height="3" fill="#78716c" />
          {Array.from({ length: 13 }, (_, i) => (
            <rect
              key={i}
              x={42 + i * 12}
              y={72 + r * 22 + (i % 3)}
              width="9"
              height={12 - (i % 3)}
              rx="1.5"
              fill={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"][(i + r * 2) % 6]}
            />
          ))}
        </g>
      ))}
      <rect x="34" y="66" width="168" height="80" fill="none" stroke="#44403c" strokeWidth="4" />
      <rect x="216" y="66" width="70" height="94" fill="#bae6fd" opacity=".75" />
      <rect x="216" y="66" width="70" height="94" fill="none" stroke="#44403c" strokeWidth="4" />
      <path d="M251 66 V160" stroke="#44403c" strokeWidth="3" />
      <g transform="translate(226 78)">
        <rect width="50" height="18" rx="4" fill="#111827" />
        <text x="25" y="13" textAnchor="middle" fontFamily="Arial" fontWeight="900" fontSize="11" fill="#f87171">
          OPEN
        </text>
      </g>
      <rect x="0" y="160" width="320" height="40" fill="#334155" />
      <rect x="0" y="160" width="320" height="5" fill="#94a3b8" />
      <g transform="translate(40 160)" stroke="#e2e8f0" strokeWidth="2.5" fill="none" strokeLinejoin="round">
        <path d="M0 4 h8 l8 20 h30 l6 -16 h-40" />
        <circle cx="20" cy="30" r="3.5" fill="#e2e8f0" />
        <circle cx="42" cy="30" r="3.5" fill="#e2e8f0" />
      </g>
      <g transform="translate(110 168)">
        <rect width="34" height="20" rx="3" fill={b} />
        <text x="17" y="14" textAnchor="middle" fontFamily="Arial" fontWeight="900" fontSize="10" fill="#0f172a">
          $
        </text>
      </g>
    </g>
  );
}

function WareForgeArt() {
  // An isometric pastel yard: a lavender dock wall with blue doors, trucks backed up, pallets and a forklift.
  const iso = (x: number, y: number, z = 0) => [160 + (x - y) * 13, 70 + (x + y) * 6.5 - z * 13] as const;
  const quad = (pts: (readonly [number, number])[]) => pts.map((p) => p.join(",")).join(" ");
  const block = (x: number, y: number, w: number, d: number, h: number, top: string, left: string, right: string, k: string) => (
    <g key={k}>
      <polygon points={quad([iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)])} fill={top} />
      <polygon points={quad([iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x, y + d, 0)])} fill={left} />
      <polygon points={quad([iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x + w, y, 0)])} fill={right} />
    </g>
  );
  return (
    <g>
      <rect width="320" height="200" fill="#e8ebf6" />
      <polygon points={quad([iso(-4, -4), iso(16, -4), iso(16, 16), iso(-4, 16)])} fill="#dcdfe9" />
      {block(0, 0, 12, 4, 3, "#cfd3f7", "#b8bdf3", "#9aa1ea", "wall")}
      {[1, 4.5, 8].map((x, i) => (
        <polygon key={i} points={quad([iso(x, 4, 2.4), iso(x + 2.5, 4, 2.4), iso(x + 2.5, 4, 0), iso(x, 4, 0)])} fill="#3d5fd9" />
      ))}
      {[1.2, 8.2].map((x, i) => (
        <g key={i}>
          {block(x, 4.2, 2.1, 6, 2.2, "#f7f8fc", "#e6e9f3", "#d3d7e6", `t${i}`)}
          {block(x + 0.1, 10.3, 1.9, 1.6, 1.8, i ? "#f0743a" : "#2f6fe4", i ? "#d65f28" : "#2559c4", i ? "#b94f20" : "#1e4aa8", `c${i}`)}
        </g>
      ))}
      {[[5, 6], [6, 6], [5, 7.2], [6.2, 8.4]].map(([x, y], i) => block(x, y, 0.8, 0.8, i % 2 ? 0.9 : 0.7, i % 2 ? "#6a9df5" : "#e2c08f", i % 2 ? "#4f86ee" : "#d8b98b", i % 2 ? "#3f74e6" : "#c4a273", `p${i}`))}
      {block(4.6, 9.4, 0.8, 1.2, 0.9, "#f6c21c", "#e0ad0a", "#c99a05", "fl")}
      <g transform={`translate(${iso(6.4, 7.6, 3)[0]},${iso(6.4, 7.6, 3)[1]})`}>
        <circle r="7" fill="#2f6fe4" />
        <path d="M-5 4 0 13 5 4z" fill="#2f6fe4" />
        <circle r="2.6" fill="#fff" />
      </g>
      <rect x="18" y="16" width="96" height="26" rx="13" fill="#ffffff" opacity=".85" />
      <circle cx="32" cy="29" r="7" fill="#2f6fe4" />
      <rect x="44" y="24" width="60" height="4" rx="2" fill="#1b2236" opacity=".7" />
      <rect x="44" y="31" width="40" height="3" rx="1.5" fill="#5b6478" opacity=".6" />
      <rect x="226" y="150" width="80" height="38" rx="10" fill="#ffffff" opacity=".85" />
      <rect x="234" y="158" width="30" height="4" rx="2" fill="#5b6478" />
      <rect x="234" y="167" width="50" height="7" rx="3" fill="#1b2236" />
    </g>
  );
}

function YourGovArt() {
  // A grey government desk: a county map coloured by party, and the chamber's seat chart.
  const cols = ["#e0453a", "#3d6fd8", "#f2f2f2", "#f0b429", "#9b4fd6", "#34b25a"];
  const cells: { x: number; y: number; c: string }[] = [];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 11; x++) {
      const dx = (x - 5) / 6;
      const dy = (y - 3) / 4;
      if (dx * dx + dy * dy > 1) continue;
      const k = (x * 7 + y * 13 + ((x * y) % 5)) % 9;
      cells.push({ x, y, c: k < 3 ? cols[0] : k < 6 ? cols[1] : k < 7 ? cols[4] : k < 8 ? cols[3] : cols[5] });
    }
  const seats: { x: number; y: number; c: string }[] = [];
  const order = [0, 0, 0, 5, 5, 1, 1, 1, 1, 2, 3, 3, 4, 4, 4, 4];
  [0, 1, 2].forEach((row) => {
    const n = 8 + row * 4;
    for (let j = 0; j < n; j++) {
      const a = Math.PI * (1 - (j + 0.5) / n);
      seats.push({ x: 248 + Math.cos(a) * (26 + row * 12), y: 128 - Math.sin(a) * (26 + row * 12), c: cols[order[Math.floor((j / n) * order.length)]] });
    }
  });
  return (
    <g>
      <rect width="320" height="200" fill="#c9c9c9" />
      <rect width="320" height="22" fill="#4a4a4a" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={8 + i * 34} y="6" width="28" height="10" rx="3" fill="#5f5f5f" />
      ))}
      <rect x="10" y="30" width="182" height="134" rx="6" fill="#3b8fe0" />
      {cells.map((c, i) => (
        <rect key={i} x={22 + c.x * 15} y={44 + c.y * 15} width="14" height="14" fill={c.c} stroke="#fafafa" strokeWidth="1.2" />
      ))}
      <rect x="200" y="30" width="110" height="134" rx="6" fill="#ececec" />
      {seats.map((s, i) => (
        <circle key={i} cx={s.x.toFixed(2)} cy={s.y.toFixed(2)} r="4" fill={s.c} stroke="#0003" />
      ))}
      <rect x="210" y="142" width="90" height="12" rx="4" fill="#3f8f46" />
      <rect y="172" width="320" height="28" fill="#8d8d8d" />
      <circle cx="298" cy="186" r="11" fill="#555" />
      <text x="16" y="192" fill="#fff" fontSize="14" fontWeight="900" fontFamily="system-ui, sans-serif">
        YourGov
      </text>
    </g>
  );
}

function LifelineArt({ id }: { id: string }) {
  // A cutaway hospital floor seen from above at night: teal rooms, beds, an ambulance at the door, a heartbeat line.
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-llbg`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#06231f" />
          <stop offset="1" stopColor="#0b1220" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-llbg)`} />
      <rect x="24" y="22" width="272" height="128" rx="4" fill="#bfe3dc" stroke="#f1efe9" strokeWidth="5" />
      <path d="M118 22v70M206 22v70M24 92h272" stroke="#f1efe9" strokeWidth="5" />
      <rect x="128" y="30" width="70" height="56" fill="#f9a8d4" opacity=".35" />
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${136 + k * 21} 36)`}>
          <rect width="14" height="28" rx="2" fill="#f4f6f8" />
          <rect y="10" width="14" height="18" rx="2" fill="#2dd4bf" />
        </g>
      ))}
      <rect x="36" y="34" width="70" height="50" fill="#4ade80" opacity=".3" />
      <rect x="48" y="48" width="34" height="14" rx="2" fill="#93c5fd" />
      <rect x="216" y="30" width="72" height="56" fill="#c4b5fd" opacity=".35" />
      <rect x="232" y="42" width="30" height="30" rx="3" fill="#e5e7eb" />
      <rect x="40" y="104" width="100" height="10" rx="3" fill="#3b82f6" />
      <rect x="40" y="124" width="100" height="10" rx="3" fill="#3b82f6" />
      <rect x="170" y="108" width="54" height="14" rx="3" fill="#f4f6f8" />
      <rect x="0" y="162" width="320" height="38" fill="#3a3d42" />
      <g transform="translate(206 166)">
        <rect width="64" height="26" rx="4" fill="#f8fafc" />
        <rect y="13" width="64" height="5" fill="#dc2626" />
        <rect x="26" y="4" width="10" height="3" fill="#dc2626" />
        <rect x="29" y="1" width="4" height="9" fill="#dc2626" />
        <rect x="46" y="-4" width="10" height="4" rx="1" fill="#3b82f6" />
      </g>
      <path d="M20 182h40l8-16 10 30 8-14h40" fill="none" stroke="#2dd4bf" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function ZeroCityArt({ id }: { id: string }) {
  // Golden hour over a low-poly grid town: brick blocks, a glass tower, a road with lane marks, and the four-tile mark.
  const blocks = [
    [18, 46, 34, "#a3412f"],
    [58, 70, 28, "#e8dcc0"],
    [92, 38, 30, "#8f3a2a"],
    [130, 104, 32, "#6f93b0"],
    [168, 62, 26, "#b04a35"],
    [200, 84, 30, "#ddd2b6"],
    [236, 52, 24, "#9aa1a8"],
    [266, 74, 34, "#a3412f"],
  ] as const;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-zcsky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2c55" />
          <stop offset=".55" stopColor="#d9705a" />
          <stop offset="1" stopColor="#ffcf8a" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-zcsky)`} />
      <circle cx="244" cy="118" r="22" fill="#fff1c8" opacity=".9" />
      <rect y="140" width="320" height="60" fill="#5fa83a" />
      {blocks.map(([x, h, w, c], i) => (
        <g key={i}>
          <rect x={x} y={140 - h} width={w} height={h} fill={c} />
          {Array.from({ length: Math.floor(h / 11) }, (_, r) =>
            Array.from({ length: Math.floor(w / 9) }, (_, k) => (
              <rect key={`${r}-${k}`} x={x + 3 + k * 9} y={140 - h + 5 + r * 11} width="5" height="6" fill={(i + r + k) % 3 ? "#1c2530" : "#ffd48a"} opacity=".85" />
            )),
          )}
        </g>
      ))}
      <rect y="156" width="320" height="22" fill="#2b2d31" />
      {Array.from({ length: 12 }, (_, k) => (
        <rect key={k} x={8 + k * 28} y="166" width="14" height="2" fill="#f3f3ee" />
      ))}
      <rect y="154" width="320" height="2" fill="#b9b4aa" />
      <rect y="178" width="320" height="2" fill="#b9b4aa" />
      <g transform="translate(16 14) scale(.62)">
        <rect x="4" y="4" width="26" height="26" rx="8" fill="#f4f7fb" />
        <rect x="34" y="4" width="26" height="26" rx="8" fill="#22e5ff" />
        <rect x="4" y="34" width="26" height="26" rx="8" fill="#9fb0c4" />
        <rect x="34" y="34" width="26" height="26" rx="8" fill="#f4f7fb" />
      </g>
    </g>
  );
}

function CityArt({ id }: { id: string }) {
  // A city at dusk from across the river: towers with lit windows, a rising moon, the skyline in the water.
  const towers = [
    [14, 70, 26],
    [44, 104, 30],
    [78, 58, 22],
    [104, 132, 34],
    [142, 88, 28],
    [174, 150, 30],
    [208, 96, 26],
    [238, 120, 32],
    [274, 74, 30],
    [300, 54, 20],
  ];
  const base = 150;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-zsky`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0c1445" />
          <stop offset=".55" stopColor="#7c3aed" />
          <stop offset=".85" stopColor="#f97316" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id={`${id}-zwater`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="1" stopColor="#020617" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-zsky)`} />
      <circle cx="252" cy="44" r="14" fill="#fef3c7" opacity=".9" />
      <rect y={base} width="320" height="50" fill={`url(#${id}-zwater)`} />
      {towers.map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={base - h} width={w} height={h} fill="#0f172a" />
          <rect x={x} y={base} width={w} height={h * 0.32} fill="#0f172a" opacity=".45" />
          {Array.from({ length: Math.floor(h / 12) }, (_, r) =>
            Array.from({ length: Math.floor(w / 8) }, (_, c) =>
              (i * 7 + r * 3 + c * 5) % 4 ? (
                <rect
                  key={`${r}-${c}`}
                  x={x + 3 + c * 8}
                  y={base - h + 6 + r * 12}
                  width="4"
                  height="5"
                  fill="#fde68a"
                  opacity={(i + r + c) % 3 ? 0.85 : 0.45}
                />
              ) : null,
            ),
          )}
        </g>
      ))}
      <rect x="0" y={base - 2} width="320" height="3" fill="#fbbf24" opacity=".7" />
      {[30, 90, 150, 210, 270].map((x) => (
        <rect key={x} x={x} y={base + 10 + (x % 3) * 8} width="26" height="2" fill="#fde68a" opacity=".35" />
      ))}
      <text x="12" y="28" fontFamily="Arial" fontWeight="900" fontSize="14" fill="#fff">
        ZLINK+
      </text>
    </g>
  );
}

function LinkArt() {
  // A board of glowing nodes with one link lit through them, and a loop closing.
  const cols = ["#22e5ff", "#ff2bd6", "#8b5cff", "#ffcb3d", "#3dffa2"];
  const grid = [
    [0, 1, 2, 3, 4, 2, 0, 1],
    [2, 0, 0, 0, 1, 3, 4, 2],
    [4, 3, 2, 0, 2, 2, 2, 0],
    [1, 2, 4, 1, 3, 2, 2, 4],
  ];
  const link = [
    [1, 1],
    [2, 1],
    [3, 1],
    [3, 2],
  ];
  const loop = [
    [5, 2],
    [6, 2],
    [6, 3],
    [5, 3],
    [5, 2],
  ];
  const x = (c: number) => 34 + c * 36;
  const y = (r: number) => 46 + r * 36;
  return (
    <g>
      <rect width="320" height="200" fill="#0b0d1f" />
      <rect width="320" height="200" fill="url(#art-linkwave-glow)" opacity=".6" />
      <polyline points={link.map(([c, r]) => `${x(c)},${y(r)}`).join(" ")} fill="none" stroke="#22e5ff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity=".35" />
      <polyline points={link.map(([c, r]) => `${x(c)},${y(r)}`).join(" ")} fill="none" stroke="#22e5ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={loop.map(([c, r]) => `${x(c)},${y(r)}`).join(" ")} fill="none" stroke="#8b5cff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {grid.flatMap((row, r) =>
        row.map((k, c) => (
          <g key={`${c}-${r}`}>
            <circle cx={x(c)} cy={y(r)} r="13" fill={cols[k]} opacity=".25" />
            <circle cx={x(c)} cy={y(r)} r="9" fill={cols[k]} />
            <circle cx={x(c) - 3} cy={y(r) - 3} r="3" fill="#fff" opacity=".5" />
          </g>
        )),
      )}
      <text x="300" y="30" textAnchor="end" fontFamily="Arial" fontWeight="900" fontSize="14" fill="#fff">
        ZLINK+
      </text>
    </g>
  );
}
