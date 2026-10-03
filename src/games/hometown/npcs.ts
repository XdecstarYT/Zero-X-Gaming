import type { Pose } from "../code-3/people3d";
import { ROADS, WALK_W } from "../life/world";
import type { WireLook } from "./presence";

/**
 * The townsfolk: up to twelve NPC citizens who walk the footpaths, stop for a
 * chat and say hello, so the street is never empty. They make room as real
 * players arrive (twelve people on the street at most, counting NPCs).
 *
 * Nothing about them goes over the network: where each one is comes from the
 * clock alone, so everyone on the same server sees the same person in the same
 * spot. On the server the same names trade on the exchange while nobody is
 * playing (see `town__npcs` in the database).
 */

export const MAX_NPCS = 12;

export interface Townsperson {
  id: string;
  name: string;
  look: WireLook;
  /** A footpath stretch they pace: from (ax, az) to (bx, bz). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  speed: number;
  /** Seconds standing at each end before turning back. */
  rest: number;
  /** Where in the walk they start (seconds). */
  phase: number;
}

const NAMES = ["Maple Jones", "Rosa Quill", "Ted Harrow", "Ivy Banks", "Sol Okafor", "Nina Park", "Gus Fairweather", "Lena Moss", "Arlo Penn", "Hattie Vale", "Omar Reyes", "Pip Calloway"];

/** A small fixed hash, so each server lays its townsfolk out differently but always the same way. */
function seeded(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** The twelve townsfolk of a server. Half of them keep to Main Street, where the shops are. */
export function townsfolk(server: string): Townsperson[] {
  const rnd = seeded(`town:${server}`);
  return NAMES.map((name, i) => {
    const road = i % 2 === 0 ? ROADS[0] : ROADS[1 + (i % (ROADS.length - 1))];
    const along = road.w > road.d;
    const len = 30 + rnd() * 40;
    let ax: number, az: number, bx: number, bz: number;
    if (along) {
      // Main Street's busy stretch is the middle; other streets anywhere.
      const lo = road === ROADS[0] ? -120 : road.x + 10;
      const hi = road === ROADS[0] ? 120 - len : road.x + road.w - 10 - len;
      ax = lo + rnd() * Math.max(1, hi - lo);
      bx = ax + len;
      az = bz = rnd() < 0.5 ? road.z + road.d + WALK_W / 2 : road.z - WALK_W / 2;
    } else {
      az = road.z + 12 + rnd() * Math.max(1, road.d - 24 - len);
      bz = az + len;
      ax = bx = rnd() < 0.5 ? road.x + road.w + WALK_W / 2 : road.x - WALK_W / 2;
    }
    return {
      id: `npc:${i}`,
      name,
      look: { sex: i % 2 ? "M" : "F", skin: i % 5, hair: (i * 3) % 6, shirt: (i * 5) % 8 },
      ax,
      az,
      bx,
      bz,
      speed: 1.15 + rnd() * 0.45,
      rest: 2 + rnd() * 5,
      phase: rnd() * 600,
    };
  });
}

/** How many townsfolk are out: they fill the street up to twelve people and make way for real players. */
export function npcCount(players: number) {
  return Math.max(0, Math.min(MAX_NPCS, MAX_NPCS - players));
}

export interface NpcPose {
  x: number;
  z: number;
  heading: number;
  speed: number;
  pose: Pose;
}

/** Where a townsperson is at `t` seconds of shared clock: pacing their stretch, resting at each end. */
export function npcAt(p: Townsperson, t: number): NpcPose {
  const dx = p.bx - p.ax;
  const dz = p.bz - p.az;
  const len = Math.hypot(dx, dz);
  const walk = len / p.speed;
  const cycle = 2 * (walk + p.rest);
  let u = (t + p.phase) % cycle;
  if (u < 0) u += cycle;
  const out = Math.atan2(dx, dz);
  const back = Math.atan2(-dx, -dz);
  if (u < walk) {
    const f = u / walk;
    return { x: p.ax + dx * f, z: p.az + dz * f, heading: out, speed: p.speed, pose: "walk" };
  }
  u -= walk;
  if (u < p.rest) return { x: p.bx, z: p.bz, heading: out, speed: 0, pose: u < p.rest / 2 ? "talk" : "stand" };
  u -= p.rest;
  if (u < walk) {
    const f = u / walk;
    return { x: p.bx - dx * f, z: p.bz - dz * f, heading: back, speed: p.speed, pose: "walk" };
  }
  return { x: p.ax, z: p.az, heading: back, speed: 0, pose: "stand" };
}

const LINES = [
  "Morning! Wheat's fetching a fair price at the exchange today.",
  "Anyone selling planks? I've a fence to fix.",
  "Election's coming up. Read the slogans at City Hall before you vote.",
  "The bakery on the corner does the best loaf in town.",
  "Put a bit in the Town Bank. It grows while you sleep.",
  "Lovely day for a walk down Main Street.",
  "I hear the mine's paying well this week.",
  "Has anyone seen the new house going up on the hill?",
  "Shops on Main Street are open. Have a look in the windows.",
  "The mayor should cut the sales tax, if you ask me.",
  "Back to the timber yard for me. Logs won't chop themselves.",
  "Welcome to Hometown! Wave if you're new.",
];

/** Every so often one of the townsfolk out on the street says something (the same line for everyone). */
export function npcChatter(server: string, t: number, count: number, every = 45): { id: number; name: string; text: string } | null {
  if (count <= 0) return null;
  const slot = Math.floor(t / every);
  const rnd = seeded(`chat:${server}:${slot}`);
  const who = Math.floor(rnd() * count);
  return { id: slot, name: NAMES[who], text: LINES[Math.floor(rnd() * LINES.length)] };
}

/** A friendly answer when you walk up and press E. */
export function npcGreeting(name: string, t: number) {
  const rnd = seeded(`hi:${name}:${Math.floor(t / 20)}`);
  return `${name}: "${LINES[Math.floor(rnd() * LINES.length)]}"`;
}
