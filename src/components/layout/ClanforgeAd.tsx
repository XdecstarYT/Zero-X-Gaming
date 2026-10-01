"use client";

import Link from "next/link";
import { beatAt, Frame, useTimeline } from "@/components/sports/SportsCinema";
import { useAdTurn } from "./ad-turn";

/** How many times the Clanforge spot has played in this browser (it plays twice). */
export const CLANFORGE_AD_KEY = "zx-clanforge-ad-count";
export const CLANFORGE_AD_RUNS = 2;
export const CLANFORGE_AD_S = 24;

const BEATS = [
  [0, "dawn"],
  [4, "build"],
  [8.5, "train"],
  [12.5, "raid"],
  [17, "defend"],
  [20, "title"],
  [22, "end"],
] as const;

const COLD = "EVERY EMPIRE STARTS WITH ONE KEEP.";
const GOLD = "#facc15";
const MANA = "#c084fc";

/** Isometric tile → screen (a 1600×900 frame). */
const iso = (x: number, y: number) => [800 + (x - y) * 46, 470 + (x + y) * 23] as const;

function Block({ x, y, w, h, color, roof, delay, flag }: { x: number; y: number; w: number; h: number; color: string; roof: string; delay: number; flag?: string }) {
  const [cx, cy] = iso(x, y);
  const hw = w * 46;
  const hh = w * 23;
  return (
    <g className="zx-cf-rise" style={{ animationDelay: `${delay}s`, transformOrigin: `${cx}px ${cy + hh}px` }}>
      <path d={`M${cx - hw} ${cy} L${cx} ${cy + hh} L${cx} ${cy + hh - h} L${cx - hw} ${cy - h} Z`} fill={color} />
      <path d={`M${cx + hw} ${cy} L${cx} ${cy + hh} L${cx} ${cy + hh - h} L${cx + hw} ${cy - h} Z`} fill={color} opacity=".75" />
      <path d={`M${cx - hw} ${cy - h} L${cx} ${cy - h - hh} L${cx + hw} ${cy - h} L${cx} ${cy + hh - h} Z`} fill={roof} />
      {flag && (
        <>
          <path d={`M${cx} ${cy - h - hh} L${cx} ${cy - h - hh - 70}`} stroke="#e7e5e4" strokeWidth="4" />
          <path d={`M${cx} ${cy - h - hh - 70} l40 12 l-40 12 Z`} fill={flag} />
        </>
      )}
    </g>
  );
}

/** The village: Keep in the middle, mines, wells, cannons, towers, then the walls. */
function Village({ night = false, burning = false }: { night?: boolean; burning?: boolean }) {
  const pieces = [
    { x: 0, y: 0, w: 2, h: 110, color: "#78716c", roof: "#b91c1c", flag: "#d97706" },
    { x: -4, y: 0, w: 1.2, h: 40, color: "#92400e", roof: GOLD },
    { x: 0, y: -4, w: 1.2, h: 40, color: "#5b21b6", roof: MANA },
    { x: 4, y: 0, w: 1, h: 30, color: "#44403c", roof: "#1c1917" },
    { x: 0, y: 4, w: 1, h: 30, color: "#44403c", roof: "#1c1917" },
    { x: 3.5, y: -3.5, w: 1, h: 90, color: "#6b4f2e", roof: "#b91c1c" },
    { x: -3.5, y: 3.5, w: 1.3, h: 50, color: "#57534e", roof: "#0f766e" },
    { x: -3.5, y: -3.5, w: 1.1, h: 60, color: "#a8a29e", roof: "#c084fc" },
    { x: 3.5, y: 3.5, w: 1.1, h: 45, color: "#92400e", roof: "#facc15" },
  ];
  const wall: string[] = [];
  for (const [a, b] of [
    [-6, -6],
    [6, -6],
    [6, 6],
    [-6, 6],
    [-6, -6],
  ] as const) {
    const [x, y] = iso(a, b);
    wall.push(`${wall.length ? "L" : "M"}${x} ${y}`);
  }
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="cf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? "#050816" : "#fbbf24"} />
          <stop offset=".5" stopColor={night ? "#111a3a" : "#f97316"} />
          <stop offset="1" stopColor={night ? "#0b1208" : "#3f6212"} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#cf-sky)" />
      <path d="M0 330 L220 200 L380 300 L560 160 L760 290 L960 150 L1180 280 L1380 190 L1600 300 L1600 900 L0 900 Z" fill={night ? "#0f1a12" : "#365314"} opacity=".9" />
      <path d={`M${iso(-8, -8).join(" ")} L${iso(8, -8).join(" ")} L${iso(8, 8).join(" ")} L${iso(-8, 8).join(" ")} Z`} fill={night ? "#1f3d17" : "#4d7c0f"} />
      <path d={wall.join(" ")} fill="none" stroke="#a8a29e" strokeWidth="14" strokeLinejoin="round" className="zx-sp-draw" style={{ ["--len" as string]: 2600, animationDelay: "2.2s" }} />
      {pieces.map((p, i) => (
        <Block key={i} {...p} delay={0.25 + i * 0.22} />
      ))}
      {burning &&
        [
          [-4, 0],
          [3.5, -3.5],
          [0, 4],
          [-3.5, 3.5],
          [4, 0],
        ].map(([x, y], i) => {
          const [cx, cy] = iso(x, y);
          return <circle key={i} cx={cx} cy={cy - 40} r="60" fill="#fb923c" className="zx-cf-boom" style={{ animationDelay: `${0.3 + i * 0.55}s` }} />;
        })}
      {night && (
        <>
          {[0, 0.6, 1.2].map((d) => (
            <ellipse key={d} cx="800" cy="470" rx="470" ry="260" fill="none" stroke="#38bdf8" strokeWidth="6" className="zx-cf-shield" style={{ animationDelay: `${d}s` }} />
          ))}
          <ellipse cx="800" cy="440" rx="470" ry="300" fill="#38bdf8" opacity=".08" />
        </>
      )}
    </svg>
  );
}

const TROOPS = [
  { name: "Brawlers", color: "#e0a63a", size: 18 },
  { name: "Rangers", color: "#3fa34d", size: 16 },
  { name: "Raiders", color: "#7c3aed", size: 16 },
  { name: "Brutes", color: "#b45309", size: 30 },
  { name: "Sappers", color: "#64748b", size: 16 },
];

/** Troops marching across the valley, a drake overhead. */
function Army() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(#1e293b_0%,#7c2d12_45%,#365314_46%,#1a2e05_100%)]" aria-hidden />
      {TROOPS.map((tr, row) => (
        <div key={tr.name} className="zx-cf-march absolute left-0 flex items-end gap-3" style={{ top: `${50 + row * 8}%`, animationDelay: `${row * 0.25}s` }}>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="block rounded-t-full" style={{ width: tr.size, height: tr.size * 1.6, background: tr.color, boxShadow: "0 4px 0 rgba(0,0,0,0.35)" }} />
          ))}
          <span className="ml-3 font-display text-sm font-black uppercase tracking-[0.3em] text-white/90">{tr.name}</span>
        </div>
      ))}
      <svg viewBox="0 0 200 80" className="zx-cf-drake absolute top-[12%] h-[16vh]" aria-hidden>
        <path d="M20 40 Q100 20 180 40 Q100 52 20 40 Z" fill="#dc2626" />
        <path d="M80 36 L50 0 L110 34 Z M110 36 L150 4 L130 38 Z" fill="#991b1b" />
        <path d="M180 40 L196 34 L192 46 Z" fill="#dc2626" />
        <path d="M196 40 Q230 46 250 70" stroke="#fb923c" strokeWidth="10" fill="none" opacity=".8" />
      </svg>
      <div className="absolute inset-x-0 top-[18vh] text-center">
        <p className="zx-sp-word font-display text-6xl font-black uppercase italic sm:text-8xl">Train.</p>
        <p className="zx-ad-rise mt-1 font-display text-xs font-bold uppercase tracking-[0.5em] text-white/80 [animation-delay:600ms]">Six troops · Clan reinforcements · Drakes</p>
      </div>
    </div>
  );
}

/**
 * A 24-second spot for Clanforge, second in the ad queue (after Boundary
 * Blitz's): it plays after the intro on two visits, one ad per visit, then
 * hands the slot on to the Sports+ and Code 3 spots. Unskippable; the last
 * beat links to the game.
 */
export function ClanforgeAd() {
  const ad = useAdTurn({ name: "clanforgeAd", elementId: "zx-clanforge-ad", countKey: CLANFORGE_AD_KEY, sessionKey: "zx-clanforge-ad-session", runs: CLANFORGE_AD_RUNS, seconds: CLANFORGE_AD_S, after: "cricketAd" });
  const t = useTimeline(ad.playing);
  if (!ad.playing) return null;
  const beat = beatAt(BEATS, t);
  const left = Math.max(0, Math.ceil(CLANFORGE_AD_S - t));
  const typed = COLD.slice(0, Math.floor(Math.min(1, Math.max(0, t - 0.6) / 2.2) * COLD.length));
  const raidT = t - 12.5;
  const pct = Math.max(0, Math.min(100, Math.round(raidT * 26)));
  const stars = (pct >= 50 ? 1 : 0) + (pct >= 75 ? 1 : 0) + (pct >= 100 ? 1 : 0);

  return (
    <div id="zx-clanforge-ad">
      <Frame label="Clanforge trailer" testId="clanforge-ad">
        <p className="sr-only" aria-live="polite">
          Clanforge, build your village and raid for glory. {beat}
        </p>
        {beat === "dawn" && (
          <div key="dawn" className="absolute inset-0">
            <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="zx-sp-kenburns absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <linearGradient id="cf-dawn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0b1026" />
                  <stop offset=".55" stopColor="#c2410c" />
                  <stop offset="1" stopColor="#1a2e05" />
                </linearGradient>
              </defs>
              <rect width="1600" height="900" fill="url(#cf-dawn)" />
              <circle cx="800" cy="520" r="150" fill="#fde68a" opacity=".85" />
              <path d="M0 560 L240 380 L420 500 L640 330 L860 480 L1060 340 L1290 500 L1600 380 L1600 900 L0 900 Z" fill="#1c1917" />
              <path d="M0 700 Q800 610 1600 700 L1600 900 L0 900 Z" fill="#14532d" />
              <g transform="translate(800 640)">
                <path d="M-40 0 L-40 -90 L40 -90 L40 0 Z" fill="#0c0a09" />
                <path d="M-50 -90 L0 -130 L50 -90 Z" fill="#0c0a09" />
                <path d="M0 -130 L0 -180" stroke="#0c0a09" strokeWidth="5" />
                <path d="M0 -180 l32 10 l-32 10 Z" fill="#d97706" />
              </g>
            </svg>
            <div className="absolute inset-x-0 bottom-[16vh] px-6 text-center">
              <p className="font-display text-xl font-black uppercase italic tracking-wide drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] sm:text-4xl">
                {typed}
                <span className="animate-pulse text-[#d97706]">▌</span>
              </p>
            </div>
          </div>
        )}
        {beat === "build" && (
          <div key="build" className="absolute inset-0">
            <Village />
            <div className="absolute inset-x-0 top-[14vh] text-center">
              <p className="zx-sp-word font-display text-6xl font-black uppercase italic drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-8xl">Build.</p>
              <p className="zx-ad-rise mt-1 font-display text-xs font-bold uppercase tracking-[0.5em] text-white [animation-delay:600ms]">Mines · Wells · Vaults · Cannons · Walls</p>
            </div>
          </div>
        )}
        {beat === "train" && (
          <div key="train" className="absolute inset-0">
            <Army />
          </div>
        )}
        {beat === "raid" && (
          <div key="raid" className="absolute inset-0">
            <Village burning />
            <div className="absolute inset-x-0 top-[12vh] text-center">
              <p className="zx-sp-word font-display text-6xl font-black uppercase italic drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-8xl">Raid.</p>
            </div>
            <div className="absolute top-[18vh] right-6 rounded-xl bg-black/65 px-4 py-2 text-right sm:right-12">
              <p className="text-4xl tracking-widest text-[#facc15]">{"★".repeat(stars) + "☆".repeat(3 - stars)}</p>
              <p className="font-display text-3xl font-black tabular-nums">{pct}%</p>
              <p className="flex items-center justify-end gap-3 text-sm font-bold">
                <span className="text-[#facc15]">+{(pct * 182).toLocaleString("en-US")}</span>
                <span className="text-[#c084fc]">+{(pct * 151).toLocaleString("en-US")}</span>
              </p>
            </div>
          </div>
        )}
        {beat === "defend" && (
          <div key="defend" className="absolute inset-0">
            <Village night />
            <div className="absolute inset-x-0 bottom-[16vh] px-6 text-center">
              <p className="zx-ad-rise font-display text-2xl font-black uppercase italic sm:text-5xl">They&apos;ll come for your gold</p>
              <p className="zx-ad-rise mt-1 font-display text-xs font-bold uppercase tracking-[0.5em] text-[#7dd3fc] [animation-delay:600ms]">while you sleep</p>
            </div>
          </div>
        )}
        {beat === "title" && (
          <div key="title" className="absolute inset-0 grid place-items-center text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#7c2d12,#0b0604_65%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-30" aria-hidden />
            <p className="zx-sp-slam relative font-display text-[15vw] leading-none font-black uppercase italic tracking-tighter text-[#fbbf24] drop-shadow-[0_0_40px_rgba(217,119,6,0.6)] sm:text-[11rem]">Clanforge</p>
          </div>
        )}
        {beat === "end" && (
          <div key="end" className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#7c2d12,#0b0604_65%)]" aria-hidden />
            <div className="relative flex flex-col items-center">
              <p className="zx-ad-slam font-display text-6xl font-black uppercase italic tracking-tight text-[#fbbf24] sm:text-8xl">Clanforge</p>
              <p className="zx-ad-rise mt-2 font-display text-xs font-bold uppercase tracking-[0.45em] text-white/85 [animation-delay:400ms] sm:text-sm">Build · Train · Raid · Defend · Free on Zero X</p>
              <Link
                href="/games/clanforge"
                onClick={ad.stop}
                className="zx-ad-rise mt-6 rounded-md bg-[#d97706] px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-white shadow-[0_0_30px_#d9770688] [animation-delay:900ms]"
              >
                Build your village
              </Link>
            </div>
          </div>
        )}
        <div className="absolute top-[calc(9vh+0.75rem)] right-3 z-40 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">Ad · {left}s</div>
        <div className="absolute inset-x-0 bottom-[9vh] z-40 h-0.5 bg-white/10" aria-hidden>
          <div className="h-full bg-gradient-to-r from-[#d97706] to-[#7c3aed]" style={{ width: `${Math.min(100, (t / CLANFORGE_AD_S) * 100)}%` }} />
        </div>
      </Frame>
    </div>
  );
}
