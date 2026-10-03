"use client";

import Link from "next/link";
import { beatAt, Frame, LogoSlam, useTimeline } from "@/components/sports/SportsCinema";
import { useAdTurn } from "./ad-turn";

/** How many times the UBusiness spot has played in this browser (it plays three times). */
export const UBUSINESS_AD_KEY = "zx-ubusiness-ad-count";
export const UBUSINESS_AD_RUNS = 3;
export const UBUSINESS_AD_S = 26;

const BEATS = [
  [0, "dawn"],
  [4.5, "logo"],
  [7.5, "title"],
  [11, "shelves"],
  [14.5, "till"],
  [18, "grow"],
  [21, "editions"],
  [23.5, "end"],
] as const;

const COLD = "EVERY EMPIRE STARTS WITH ONE SHOP.";
const TEAL = "#14b8a6";
const GOLD = "#f59e0b";

/** A shop front at dawn: the street, the window, the shutter rolling up on a lit interior. */
function ShopFront({ open = true }: { open?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[linear-gradient(#0b1020_0%,#3b2a4a_38%,#f59e0b_62%,#1c1917_63%,#0c0a09_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[37%] bg-[linear-gradient(#292524,#0c0a09)]" />
      {/* The building. */}
      <div className="absolute bottom-[37%] left-1/2 h-[46vh] w-[min(86vw,900px)] -translate-x-1/2 bg-[#e7e5e4] shadow-[0_0_80px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-x-0 top-0 grid h-[22%] place-items-center bg-[#0f766e]">
          <span className="font-display text-[4.5vh] font-black uppercase tracking-[0.25em] text-white drop-shadow-[0_0_14px_#5eead4]">UBusiness</span>
        </div>
        <div className="absolute inset-x-[5%] bottom-0 top-[30%] overflow-hidden bg-[radial-gradient(circle_at_50%_30%,#fff7e6,#d6c7a8_55%,#78716c)]">
          {/* Shelves full of stock inside. */}
          {[0, 1, 2].map((r) => (
            <div key={r} className="absolute inset-x-[6%] flex gap-[0.6%]" style={{ top: `${18 + r * 26}%`, height: "18%" }}>
              {Array.from({ length: 22 }, (_, i) => (
                <span key={i} className="flex-1 rounded-sm" style={{ background: ["#dc2626", "#2563eb", "#f59e0b", "#16a34a", "#7c3aed", "#f5f5f4"][(i * 7 + r * 3) % 6], height: `${70 + ((i * 13) % 30)}%`, alignSelf: "flex-end" }} />
              ))}
            </div>
          ))}
          {/* The shutter. */}
          <div className={open ? "zx-ub-shutter absolute inset-0 bg-[repeating-linear-gradient(#a8a29e_0_10px,#78716c_10px_12px)]" : "absolute inset-0 bg-[repeating-linear-gradient(#a8a29e_0_10px,#78716c_10px_12px)]"} />
        </div>
      </div>
      {/* Warm light spilling onto the pavement. */}
      <div className="absolute bottom-[10%] left-1/2 h-[28vh] w-[70vw] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,#fde68a55,transparent_70%)]" />
    </div>
  );
}

/** Stock dropping onto three shelves, row by row. */
function Shelves() {
  const colours = ["#dc2626", "#2563eb", "#f59e0b", "#16a34a", "#7c3aed", "#f5f5f4", "#0f766e", "#db2777"];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_50%_20%,#fefce8,#d6d3d1_45%,#57534e)]" aria-hidden>
      {[0, 1, 2].map((r) => (
        <div key={r} className="absolute inset-x-[8%]" style={{ top: `${24 + r * 23}%`, height: "18%" }}>
          <div className="absolute inset-x-0 bottom-0 h-[8%] bg-[#e7e5e4] shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
          <div className="absolute inset-x-0 bottom-[8%] top-0 flex items-end gap-[0.8%]">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className="zx-ub-drop relative flex-1 rounded-[3px] shadow-[inset_-6px_0_10px_rgba(0,0,0,0.25)]"
                style={{ background: colours[(i * 5 + r * 3) % colours.length], height: `${55 + ((i * 17 + r * 7) % 40)}%`, animationDelay: `${0.15 + r * 0.55 + i * 0.05}s` }}
              >
                <span className="absolute inset-x-[12%] top-[30%] h-[18%] rounded-sm bg-white/70" />
              </span>
            ))}
          </div>
          <span className="absolute -bottom-[1px] left-[4%] h-[22%] rounded-sm bg-[#fde047] px-2 font-display text-[1.6vh] font-black text-black">$4.49</span>
        </div>
      ))}
      <div className="absolute inset-x-0 top-[10vh] z-10 text-center">
        <p className="zx-sp-word font-display text-5xl font-black uppercase italic text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)] sm:text-7xl">Stock it.</p>
      </div>
    </div>
  );
}

/** The till: items slide over the scanner and the total counts up. */
function Till({ t }: { t: number }) {
  const items = [
    ["Sourdough Loaf", 449],
    ["Whole Milk 2L", 349],
    ["Sea Salt Crisps", 329],
    ["Ground Coffee", 899],
    ["Cuddle Bear", 1999],
  ] as const;
  const shown = Math.min(items.length, Math.max(0, Math.floor((t - 0.3) / 0.5) + 1));
  const total = items.slice(0, shown).reduce((a, b) => a + b[1], 0);
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#134e4a,#020617_70%)]" aria-hidden>
      <div className="w-[min(88vw,620px)] rounded-2xl border border-teal-400/40 bg-black/70 p-5 font-mono shadow-[0_0_60px_#14b8a655]">
        <div className="mb-3 flex items-center gap-2">
          <span className="zx-ub-laser h-1.5 flex-1 rounded-full bg-red-500 shadow-[0_0_12px_#ef4444]" />
          <span className="text-xs font-bold tracking-widest text-red-300">SCAN</span>
        </div>
        {items.slice(0, shown).map(([n, p]) => (
          <div key={n} className="zx-ub-scan flex justify-between border-b border-white/10 py-1.5 text-[2.2vh] text-teal-200">
            <span>{n}</span>
            <span>${(p / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="mt-3 flex items-end justify-between">
          <span className="text-sm tracking-widest text-white/70">TOTAL</span>
          <span className="font-display text-[5vh] font-black text-white">${(total / 100).toFixed(2)}</span>
        </div>
      </div>
      {t > 2.9 && (
        <p className="zx-sp-stamp absolute bottom-[13vh] font-display text-6xl font-black italic text-[#facc15] sm:text-8xl" style={{ animationDelay: "0s" }}>
          CHA-CHING!
        </p>
      )}
    </div>
  );
}

/** Corner shop, supermarket, megastore: the building grows across the street. */
function Grow() {
  const steps = [
    { name: "Corner Shop", w: 16, h: 18 },
    { name: "Supermarket", w: 26, h: 26 },
    { name: "Megastore", w: 40, h: 36 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(#0c4a6e_0%,#7dd3fc_60%,#a8a29e_61%,#57534e_100%)]" aria-hidden>
      <div className="absolute inset-x-0 bottom-[39%] flex items-end justify-center gap-[3vw]">
        {steps.map((s, i) => (
          <div key={s.name} className="zx-ub-grow flex flex-col items-center" style={{ animationDelay: `${0.2 + i * 0.75}s` }}>
            <div className="relative bg-[#e7e5e4] shadow-[0_10px_30px_rgba(0,0,0,0.4)]" style={{ width: `${s.w}vw`, height: `${s.h}vh` }}>
              <div className="absolute inset-x-0 top-0 grid h-[22%] place-items-center bg-[#0f766e] font-display text-[1.8vh] font-black uppercase tracking-widest text-white">{s.name}</div>
              <div className="absolute inset-x-[8%] bottom-0 top-[34%] bg-[linear-gradient(135deg,#bae6fd,#e0f2fe_40%,#7dd3fc)] opacity-90" />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-[12vh] text-center">
        <p className="zx-sp-word font-display text-5xl font-black uppercase italic text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] sm:text-7xl">Grow it.</p>
      </div>
    </div>
  );
}

/**
 * A 26-second "coming soon" spot for UBusiness, first in the ad queue: it plays
 * after the intro on three visits, one ad per visit, then hands the slot on to
 * the Boundary Blitz spot. Unskippable like the others; the last beat links to
 * the game page.
 */
export function UBusinessAd() {
  const ad = useAdTurn({ name: "ubusinessAd", elementId: "zx-ubusiness-ad", countKey: UBUSINESS_AD_KEY, sessionKey: "zx-ubusiness-ad-session", runs: UBUSINESS_AD_RUNS, seconds: UBUSINESS_AD_S });
  const t = useTimeline(ad.playing);
  if (!ad.playing) return null;
  const beat = beatAt(BEATS, t);
  const left = Math.max(0, Math.ceil(UBUSINESS_AD_S - t));
  const typed = COLD.slice(0, Math.floor(Math.min(1, Math.max(0, t - 0.6) / 2.4) * COLD.length));
  const start = BEATS.find((b) => b[1] === beat)![0];

  return (
    <div id="zx-ubusiness-ad">
      <Frame label="UBusiness coming soon trailer" testId="ubusiness-ad">
        <p className="sr-only" aria-live="polite">
          UBusiness, coming soon. Run your own store. {beat}
        </p>
        {beat === "dawn" && (
          <div key="dawn" className="absolute inset-0">
            <ShopFront />
            <div className="absolute inset-x-0 bottom-[14vh] px-6 text-center">
              <p className="font-display text-xl font-black uppercase italic tracking-wide drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] sm:text-4xl">
                {typed}
                <span className="animate-pulse text-[#14b8a6]">▌</span>
              </p>
            </div>
          </div>
        )}
        {beat === "logo" && (
          <div key="logo" className="absolute inset-0">
            <LogoSlam sub="presents" />
          </div>
        )}
        {beat === "title" && (
          <div key="title" className="absolute inset-0 grid place-items-center text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,#115e59,#020617_65%)]" aria-hidden />
            <div className="zx-ad-rays absolute inset-0 opacity-30" aria-hidden />
            <div className="relative">
              <p className="zx-sp-slam font-display text-[15vw] leading-[0.9] font-black uppercase italic tracking-tighter drop-shadow-[0_0_40px_rgba(20,184,166,0.45)] sm:text-[10rem]">
                U<span className="text-[#14b8a6]">Business</span>
              </p>
              <p className="zx-ad-rise mt-3 font-display text-sm font-bold uppercase tracking-[0.55em] text-white/85 [animation-delay:900ms]">Your store. Your prices. Your empire.</p>
              <p className="zx-sp-stamp mt-5 inline-block -rotate-3 rounded-md border-4 border-[#f59e0b] px-5 py-1 font-display text-4xl font-black uppercase tracking-widest text-[#f59e0b] sm:text-6xl" style={{ animationDelay: "1.6s" }}>
                Coming soon
              </p>
            </div>
          </div>
        )}
        {beat === "shelves" && (
          <div key="shelves" className="absolute inset-0">
            <Shelves />
          </div>
        )}
        {beat === "till" && (
          <div key="till" className="absolute inset-0">
            <Till t={t - start} />
          </div>
        )}
        {beat === "grow" && (
          <div key="grow" className="absolute inset-0">
            <Grow />
          </div>
        )}
        {beat === "editions" && (
          <div key="editions" className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1c1917,#020617_70%)]" aria-hidden />
            <div className="relative grid w-full max-w-3xl gap-4 sm:grid-cols-2">
              {[
                ["Lite", "5 coins", "Grocery to fresh · a Mini Market · one helper", TEAL],
                ["Ultimate", "30 coins", "Every department · a Megastore · a full team", GOLD],
              ].map(([n, p, d, c], i) => (
                <div key={n} className="zx-ad-rise rounded-2xl border-2 bg-black/60 p-5" style={{ borderColor: c, animationDelay: `${0.2 + i * 0.4}s` }}>
                  <p className="font-display text-4xl font-black uppercase italic" style={{ color: c }}>
                    {n}
                  </p>
                  <p className="font-display text-2xl font-black">{p}</p>
                  <p className="mt-1 text-sm text-white/75">{d}</p>
                </div>
              ))}
              <p className="zx-sp-stamp font-display text-2xl font-black uppercase tracking-wider text-[#facc15] sm:col-span-2 sm:text-4xl" style={{ animationDelay: "1.1s" }}>
                Ultimate free with the battle pass
              </p>
            </div>
          </div>
        )}
        {beat === "end" && (
          <div key="end" className="absolute inset-0 grid place-items-center px-6 text-center">
            <ShopFront open={false} />
            <div className="absolute inset-0 bg-black/55" aria-hidden />
            <div className="relative flex flex-col items-center">
              <p className="zx-ad-slam font-display text-6xl font-black uppercase italic tracking-tight sm:text-8xl">
                U<span className="text-[#14b8a6]">Business</span>
              </p>
              <p className="zx-ad-rise mt-2 font-display text-xs font-bold uppercase tracking-[0.45em] text-white/85 [animation-delay:400ms] sm:text-sm">Coming soon to Zero X</p>
              <Link
                href="/games/ubusiness"
                onClick={ad.stop}
                className="zx-ad-rise mt-6 rounded-md bg-[#14b8a6] px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-[#03110f] shadow-[0_0_30px_#14b8a688] [animation-delay:900ms]"
              >
                Take a look
              </Link>
            </div>
          </div>
        )}
        <div className="absolute top-[calc(9vh+0.75rem)] right-3 z-40 rounded-full bg-black/60 px-3 py-1 font-display text-xs font-bold tracking-wider">Ad · {left}s</div>
        <div className="absolute inset-x-0 bottom-[9vh] z-40 h-0.5 bg-white/10" aria-hidden>
          <div className="h-full bg-gradient-to-r from-[#14b8a6] to-[#f59e0b]" style={{ width: `${Math.min(100, (t / UBUSINESS_AD_S) * 100)}%` }} />
        </div>
      </Frame>
    </div>
  );
}
