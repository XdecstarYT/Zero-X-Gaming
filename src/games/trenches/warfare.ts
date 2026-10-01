import type { FrontId } from "./fronts";

/**
 * Over the Top: the Great War's other weapons. Pure rules (no DOM, no network)
 * shared by the match, the renderer and the tests:
 *
 * - Poison gas: shells burst into clouds that grow, drift with the front's
 *   wind and sink into trenches (gas is heavier than air). Unmasked soldiers
 *   choke; a mask takes a moment to pull on, and fogs your aim.
 * - Bayonets: a lunge at close range; rifles with a bayonet fixed kill, a
 *   rifle butt or a sidearm only hurts. Sprinting in, it's a charge with reach.
 * - Emplaced machine guns: belt-fed and steady, but they overheat.
 * - Revives: a fallen soldier can be brought back by a medic for a few seconds.
 */

// ------------------------------------------------------------------- gas

export const GAS = {
  /** Seconds a cloud lasts, takes to spread to full size, and to thin out at the end. */
  life: 34,
  grow: 6,
  fade: 9,
  /** Full radius (m). */
  radius: 7.5,
  /** Damage per second, unmasked, at full strength. */
  dps: 11,
  /** Seconds to pull a mask on. */
  maskSeconds: 1.1,
  /** Extra strength in a trench. */
  trench: 1.6,
  /** Aim spread multiplier while masked. */
  maskSpread: 1.3,
} as const;

/** Wind (m/s) per front: where the gas goes. */
export const WIND: Record<FrontId, { x: number; y: number }> = {
  gallipoli: { x: 0.25, y: -0.1 },
  somme: { x: 0.35, y: 0.05 },
  verdun: { x: -0.2, y: 0.18 },
  passchendaele: { x: 0.3, y: 0.2 },
  vimy: { x: -0.4, y: -0.05 },
  argonne: { x: 0.12, y: -0.08 },
  helles: { x: 0.3, y: 0 },
};

export interface GasCloud {
  id: string;
  x: number;
  y: number;
  born: number;
  owner: string;
}

/** Where a cloud is now and how strong (null once it has gone). */
export function cloudState(c: GasCloud, t: number, wind: { x: number; y: number }) {
  const age = t - c.born;
  if (age < 0 || age > GAS.life) return null;
  const r = 2 + (GAS.radius - 2) * Math.min(1, age / GAS.grow);
  const k = Math.min(1, age / 0.8) * Math.min(1, (GAS.life - age) / GAS.fade);
  return { x: c.x + wind.x * age, y: c.y + wind.y * age, r, k };
}

/** Gas strength at a point (0 = clean air; can exceed 1 in a gassed trench). */
export function gasAt(clouds: GasCloud[], t: number, wind: { x: number; y: number }, x: number, y: number, inTrench: boolean) {
  let g = 0;
  for (const c of clouds) {
    const s = cloudState(c, t, wind);
    if (!s) continue;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d >= s.r) continue;
    g += s.k * Math.pow(1 - d / s.r, 0.6);
  }
  return Math.min(1.6, g * (inTrench ? GAS.trench : 1));
}

/** Damage this step: a mask (0..1, partly on while pulling it on) protects. */
export function gasDamage(exposure: number, mask: number, dt: number) {
  const leak = mask >= 1 ? 0 : 1 - mask * 0.7;
  return GAS.dps * exposure * leak * dt;
}

// --------------------------------------------------------------- bayonets

export const MELEE = {
  reach: 2.1,
  /** Reach when charging (sprinting in). */
  chargeReach: 3.3,
  /** Half-angle of the lunge (radians). */
  cone: 0.6,
  cooldown: 0.9,
  /** A fixed bayonet kills outright; a rifle butt, pistol whip or spade doesn't. */
  bayonet: 140,
  butt: 55,
  /** Metres the lunge carries you forward. */
  lunge: 0.9,
} as const;

/** Rifles carry the bayonet (Lee-Enfield, scoped or not). */
export function hasBayonet(kind: string | null | undefined) {
  return kind === "ar" || kind === "sniper";
}

export interface Body {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  team: number;
}

/**
 * Who a lunge from (x, y) facing `angle` connects with: the nearest living
 * enemy in reach and inside the cone, with clear ground between (`clear`).
 */
export function meleeTarget<T extends Body>(me: Body & { angle: number }, others: Iterable<T>, charging: boolean, clear: (x: number, y: number, d: number) => boolean): T | null {
  const reach = charging ? MELEE.chargeReach : MELEE.reach;
  let best: T | null = null;
  let bd = Infinity;
  for (const o of others) {
    if (!o.alive || o.team === me.team || o.id === me.id) continue;
    const dx = o.x - me.x;
    const dy = o.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > reach || d >= bd) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - me.angle), Math.cos(Math.atan2(dy, dx) - me.angle)));
    if (off > MELEE.cone && d > 0.6) continue;
    if (!clear(o.x, o.y, d)) continue;
    best = o;
    bd = d;
  }
  return best;
}

// ------------------------------------------------------- machine guns

export const MG = {
  /** Heat per round; it cools when not firing; at 1 it's overheated until it cools to `resume`. */
  heatPerShot: 0.03,
  cool: 0.32,
  resume: 0.35,
  /** Traverse either side of the emplacement's facing (radians). */
  arc: 0.95,
  /** Stand within this of the gun to man it (m). */
  reach: 1.4,
} as const;

/** Heat after firing `shots` this step and cooling for `dt` otherwise. */
export function stepHeat(heat: number, shots: number, dt: number, firing: boolean) {
  return Math.max(0, Math.min(1, heat + shots * MG.heatPerShot - (firing ? MG.cool * 0.25 : MG.cool) * dt));
}

/** Clamp an aim angle to the gun's traverse. */
export function clampTraverse(angle: number, facing: number) {
  const off = Math.atan2(Math.sin(angle - facing), Math.cos(angle - facing));
  return facing + Math.max(-MG.arc, Math.min(MG.arc, off));
}

// ----------------------------------------------------------------- revives

export const REVIVE = {
  /** Seconds a fallen soldier waits for a medic (when one is near). */
  window: 10,
  /** Seconds of first aid. */
  hold: 1.6,
  /** How close the medic must be (m). */
  radius: 1.7,
  /** Health they come back with (fraction). */
  hp: 0.5,
  /** A medic this close (m) makes the wait worth it. */
  medicNear: 40,
} as const;

/** Can `body` (dead since `deadAt`) still be revived at time t? */
export function revivable(alive: boolean, deadAt: number | undefined, t: number) {
  return !alive && deadAt !== undefined && t - deadAt <= REVIVE.window;
}
