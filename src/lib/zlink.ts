import { GAMES } from "./catalog";

/**
 * ZLink+: the Zero X membership (40 coins for 30 days). It covers the
 * members-only Zenith and Linkwave, every Sports+ game, UBusiness Ultimate, +25% XP,
 * double daily rewards and a weekly drop. Neon Siege — its battle pass,
 * item shop and Cash Cups — stays outside it.
 */

export const ZLINK_NAME = "ZLink+";

/** The one game that isn't part of ZLink+. */
export const ZLINK_EXCLUDED = "neon-siege";

/** Games ZLink+ unlocks (anything behind a one-time purchase, apart from Neon Siege). */
export const zlinkGames = () => GAMES.filter((g) => g.status === "live" && g.pass && g.slug !== ZLINK_EXCLUDED);

/** Is this game covered by ZLink+? */
export const inZlink = (slug: string) => zlinkGames().some((g) => g.slug === slug);

export const ZLINK_PERKS: { icon: string; title: string; text: string }[] = [
  { icon: "🏙️", title: "Zenith", text: "The members-only city builder: roads, zones, power and a photoreal skyline under a real sun. Members-only leaderboard." },
  { icon: "🌊", title: "Linkwave", text: "The members-only game: link the nodes, close the loop, beat the clock. Its leaderboard is members only." },
  { icon: "🏟️", title: "Every Sports+ game", text: "Screamer, Diamond Derby, Ace Rally, Boundary Blitz, Fairway, and every Sports+ game that comes next." },
  { icon: "🏪", title: "UBusiness Ultimate", text: "All ten departments, the megastore, the full team, marketing and photo mode." },
  { icon: "⚡", title: "+25% XP", text: "A quarter more XP from every game you play (Neon Siege aside)." },
  { icon: "🪙", title: "Double daily + a weekly drop", text: "Twice the daily ZX Cash (100 on day 7), and 15 more every week." },
  { icon: "🏅", title: "Link levels", text: "Bronze, Silver, Gold, then Neon: your level grows with every month you stay linked." },
];

/** Lines the transmission cycles through. */
export const TRANSMISSIONS = ["LINK ESTABLISHED", "EVERYTHING CONNECTS", "ONE LINK. EVERY PLUS.", "WELCOME TO ZLINK+"];

const GLYPHS = "!<>-_\\/[]{}—=+*^?#ZXL01";

/**
 * Text part-way through decrypting: characters up to `progress` (0..1) are
 * the real ones, the rest are noise from `rand`. Spaces stay spaces so the
 * shape of the line shows through.
 */
export function scramble(target: string, progress: number, rand: () => number = Math.random) {
  const shown = Math.floor(Math.max(0, Math.min(1, progress)) * target.length);
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const c = target[i];
    out += i < shown || c === " " ? c : GLYPHS[Math.floor(rand() * GLYPHS.length)];
  }
  return out;
}
