/**
 * ZLink+: a teaser. Nothing here says what it is — only that it's coming.
 */

export const ZLINK_NAME = "ZLink+";
export const ZLINK_KEY = "zx-zlink-access";

/** Lines the transmission cycles through. */
export const TRANSMISSIONS = [
  "SIGNAL ACQUIRED",
  "EVERYTHING CONNECTS",
  "ONE LINK. MORE THAN YOU THINK.",
  "ACCESS IS BEING PREPARED",
  "ARE YOU LINKED?",
  "SOON.",
];

/** The file, as far as you're allowed to read it. */
export const DOSSIER: { label: string; value: string; open?: boolean }[] = [
  { label: "Codename", value: "ZLink+", open: true },
  { label: "Status", value: "Linking…", open: true },
  { label: "Clearance", value: "Not yet", open: true },
  { label: "What it is", value: "████████ ████ ███████" },
  { label: "What it costs", value: "███ ███████" },
  { label: "What you get", value: "████ ██ ███████ ████████" },
  { label: "Arrives", value: "When the link is ready", open: true },
];

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

/** An access code for the list: ZL-XXXX-XXXX, from a number (stable for a given seed). */
export function accessCode(seed: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // 32-bit maths throughout (a timestamp times a big constant would lose its low bits as a float).
  let x = (Math.floor(Math.abs(seed)) % 2147483647) | 0;
  x = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ (Math.floor(Math.abs(seed) / 2147483647) | 0);
  let s = "";
  for (let i = 0; i < 8; i++) {
    x ^= x >>> 15;
    x = Math.imul(x, 0x2c1b3c6d);
    x ^= x >>> 12;
    x = Math.imul(x, 0x297a2d39);
    x ^= x >>> 15;
    s += alphabet[(x >>> 0) % alphabet.length];
  }
  return `ZL-${s.slice(0, 4)}-${s.slice(4)}`;
}
