import { CLUBS, type Club } from "../aussie-rules/clubs";
import { RIVALS, type Rival } from "../ace-rally/rivals";
import { HITTERS } from "../diamond-derby/sluggers";

/**
 * Live Sports: 24/7 channels of AI-versus-AI matches on one shared clock.
 * Each channel runs back-to-back fixed-length slots; a slot's match comes
 * from a seed fixed by the channel and the slot number, so everyone watching
 * sees the same match at the same moment (the sims are deterministic). Pure
 * data: no sims or rendering here, so the page can list the schedule cheaply.
 */

export type ChannelId = "footy" | "derby" | "tennis";

export interface Channel {
  id: ChannelId;
  name: string;
  sport: string;
  /** Slot length (minutes): longer than nearly every match. */
  slotMin: number;
  /** The game you can play yourself. */
  game: string;
  color: string;
}

export const CHANNELS: Channel[] = [
  { id: "footy", name: "Screamer TV", sport: "Aussie rules", slotMin: 12, game: "aussie-rules", color: "#e11d48" },
  { id: "derby", name: "Derby Night", sport: "Baseball", slotMin: 6, game: "diamond-derby", color: "#d61f3a" },
  { id: "tennis", name: "Centre Court", sport: "Tennis", slotMin: 24, game: "ace-rally", color: "#15803d" },
];

export const channelById = (id: string) => CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];

/** FNV-1a over the channel id and slot number: the slot's seed. */
export function seedFor(id: ChannelId, n: number) {
  let h = 0x811c9dc5;
  for (const ch of `${id}:${n}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

export interface Slot {
  channel: Channel;
  n: number;
  seed: number;
  start: number;
  end: number;
}

/** The slot on air at `now` (ms since the epoch), or `ahead` slots later. */
export function slotAt(channel: Channel, now: number, ahead = 0): Slot {
  const len = channel.slotMin * 60_000;
  const n = Math.floor(now / len) + ahead;
  return { channel, n, seed: seedFor(channel.id, n), start: n * len, end: (n + 1) * len };
}

/** A tiny seeded generator for picking the matchup (separate from the sims' own RNG). */
function pick(seed: number) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0;
    s = (s + 0x6d2b79f5) >>> 0;
    return (s >>> 8) / 0x1000000;
  };
}

export type Time = "day" | "twilight" | "night";

export interface FootyCard {
  kind: "footy";
  home: Club;
  away: Club;
  wet: boolean;
  tod: Time;
}
export interface DerbyCard {
  kind: "derby";
  hitter: { name: string; team: string };
  tod: Time;
}
export interface TennisCard {
  kind: "tennis";
  draw: "men" | "women";
  players: [Rival, Rival];
  surface: "hard" | "clay" | "grass";
  tod: Time;
}
export type Card = FootyCard | DerbyCard | TennisCard;

/** What's on in a slot: the clubs / players, the conditions. */
export function card(slot: Slot): Card {
  const r = pick(slot.seed);
  const tod: Time = ((t) => (t < 0.55 ? "night" : t < 0.78 ? "twilight" : "day"))(r());
  switch (slot.channel.id) {
    case "footy": {
      const a = Math.floor(r() * CLUBS.length);
      let b = Math.floor(r() * (CLUBS.length - 1));
      if (b >= a) b++;
      return { kind: "footy", home: CLUBS[a], away: CLUBS[b], wet: r() < 0.25, tod };
    }
    case "derby":
      return { kind: "derby", hitter: HITTERS[Math.floor(r() * HITTERS.length)], tod };
    case "tennis": {
      const draw = slot.n % 2 ? "women" : "men";
      const list = RIVALS[draw];
      const a = Math.floor(r() * list.length);
      let b = Math.floor(r() * (list.length - 1));
      if (b >= a) b++;
      const surface = (["hard", "clay", "grass"] as const)[Math.floor(r() * 3)];
      return { kind: "tennis", draw, players: [list[a], list[b]], surface, tod };
    }
  }
}

/** "Harbour Hawks v Coastline Sharks" */
export function title(c: Card) {
  if (c.kind === "footy") return `${c.home.name} v ${c.away.name}`;
  if (c.kind === "derby") return `${c.hitter.name} (${c.hitter.team}) goes for the title`;
  return `${c.players[0].name} v ${c.players[1].name}`;
}

/** "Rain · Night" etc. */
export function conditions(c: Card) {
  const t = c.tod === "night" ? "Night" : c.tod === "twilight" ? "Twilight" : "Day";
  if (c.kind === "footy") return `${c.wet ? "Rain" : "Fine"} · ${t}`;
  if (c.kind === "tennis") return `${c.draw === "men" ? "Men's" : "Women's"} singles · ${c.surface[0].toUpperCase()}${c.surface.slice(1)} · ${t}`;
  return `Home run derby · ${t}`;
}
