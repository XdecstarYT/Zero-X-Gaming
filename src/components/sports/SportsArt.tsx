import type { SportsGame } from "@/lib/sports";

/** Card art for an upcoming sports game: a stadium glow, pitch lines and the sport's pictogram. */
export function SportsArt({ game, className = "" }: { game: SportsGame; className?: string }) {
  const [a, b] = game.palette;
  const id = `sp-${game.id}`;
  return (
    <svg viewBox="0 0 320 180" className={className} role="img" aria-label={`${game.title} art`}>
      <defs>
        <radialGradient id={`${id}-g`} cx="50%" cy="20%" r="85%">
          <stop offset="0" stopColor={a} stopOpacity=".55" />
          <stop offset="1" stopColor={b} />
        </radialGradient>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor={a} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id}-g)`} />
      {/* Floodlights and pitch lines. */}
      {[40, 280].map((x) => (
        <g key={x} opacity=".55">
          <rect x={x - 12} y="12" width="24" height="8" rx="2" fill="#fff" />
          <path d={`M${x - 12} 20 L${x - 60} 180 L${x + 60} 180 L${x + 12} 20 Z`} fill="#fff" opacity=".06" />
        </g>
      ))}
      <path d="M0 150 L320 150 M160 110 L160 180 M60 180 Q160 118 260 180" stroke="#fff" strokeOpacity=".22" strokeWidth="2" fill="none" />
      <g transform="translate(160 88)" fill={`url(#${id}-f)`} stroke="#fff" strokeOpacity=".4" strokeWidth="2">
        {game.art === "ball" && (
          <>
            <circle r="38" />
            <path d="M0 -14 L13 -4 L8 12 L-8 12 L-13 -4 Z M0 -14 L0 -38 M13 -4 L35 -12 M8 12 L22 30 M-8 12 L-22 30 M-13 -4 L-35 -12" fill={b} stroke={b} strokeOpacity=".8" />
          </>
        )}
        {game.art === "hoop" && (
          <>
            <rect x="-46" y="-52" width="92" height="56" rx="4" fillOpacity=".25" />
            <rect x="-16" y="-30" width="32" height="22" fill="none" />
            <ellipse cy="10" rx="22" ry="6" fill="none" stroke={a} strokeOpacity="1" strokeWidth="4" />
            <path d="M-20 12 L-12 40 M20 12 L12 40 M-8 14 L-4 40 M8 14 L4 40" fill="none" />
            <circle cx="30" cy="36" r="14" />
          </>
        )}
        {game.art === "helmet" && (
          <>
            <path d="M-40 16 Q-44 -40 6 -42 Q44 -40 40 0 L40 22 L-6 22 Q-10 30 -30 28 Z" />
            <path d="M12 0 L52 0 M12 12 L52 12 M36 -4 L36 18" fill="none" stroke={b} strokeOpacity="1" strokeWidth="4" />
            <path d="M-20 -38 Q-6 -10 -8 22" fill="none" stroke={b} strokeOpacity=".8" strokeWidth="6" />
          </>
        )}
        {game.art === "puck" && (
          <>
            <path d="M-60 36 L-10 -40 L-2 -36 L-40 30 L20 30 L20 40 L-58 42 Z" />
            <ellipse cx="44" cy="30" rx="22" ry="8" fill={b} stroke="#fff" />
            <rect x="22" y="22" width="44" height="8" fill={b} stroke="none" />
            <ellipse cx="44" cy="22" rx="22" ry="8" fill={b} />
          </>
        )}
        {game.art === "racket" && (
          <>
            <ellipse cx="-10" cy="-14" rx="30" ry="38" transform="rotate(-30 -10 -14)" fillOpacity=".25" strokeWidth="6" stroke={a} strokeOpacity="1" />
            <path d="M8 18 L34 52" stroke={a} strokeOpacity="1" strokeWidth="10" strokeLinecap="round" />
            <circle cx="40" cy="-30" r="12" fill="#e6f75a" />
          </>
        )}
        {game.art === "bat" && (
          <>
            <path d="M-54 40 L-44 50 L40 -34 Q48 -46 38 -48 Q28 -50 22 -40 Z" />
            <circle cx="42" cy="28" r="16" fill="#fff" />
            <path d="M32 18 Q40 28 32 38 M52 18 Q44 28 52 38" fill="none" stroke="#e11d48" strokeOpacity="1" />
          </>
        )}
        {game.art === "glove" && (
          <>
            <path d="M-34 -20 Q-34 -46 -4 -46 L22 -46 Q40 -46 40 -24 L40 10 Q40 30 18 30 L-14 30 Q-34 30 -34 10 Z" />
            <path d="M-34 -6 Q-50 -6 -50 8 Q-50 20 -34 18" />
            <rect x="-24" y="30" width="54" height="18" rx="4" fill={b} />
          </>
        )}
        {game.art === "flag" && (
          <>
            <path d="M-6 44 L-6 -46" stroke="#fff" strokeOpacity="1" strokeWidth="4" />
            <path d="M-4 -46 L40 -34 L-4 -22 Z" fill={a} />
            <ellipse cx="-6" cy="46" rx="30" ry="7" fill={b} />
            <circle cx="24" cy="38" r="6" fill="#fff" />
          </>
        )}
      </g>
      <text x="16" y="168" fill="#fff" fillOpacity=".85" fontSize="12" fontWeight="800" letterSpacing="3" fontFamily="Arial, sans-serif">
        {game.sport.toUpperCase()}
      </text>
    </svg>
  );
}
