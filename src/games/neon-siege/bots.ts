import type { Rng } from "../engine/rng";
import { floorCells, lineOfSight } from "./map";
import { findPath } from "./path";
import { fire, isEnemy, isReloading, move, startReload, type Entity, type Weapon, type World } from "./world";

/**
 * Bot AI. A small state machine per bot:
 *   patrol  → wander between random reachable cells (A* paths)
 *   hunt    → go to where an enemy was last seen / heard
 *   engage  → face, strafe, keep range, fire in bursts once "reacted"
 *   retreat → when hurt, path to a cell the attacker can't see
 * Perception is fair: a vision cone + line of sight (plus hearing up close and
 * noticing who shot them). Skill comes only from reaction time, aim error,
 * turn speed and burst discipline, never from knowing hidden positions.
 */

export type Difficulty = "easy" | "normal" | "hard";

export interface BotSkill {
  reaction: number;
  aimError: number;
  turnSpeed: number;
  burst: [number, number];
  burstPause: [number, number];
  viewDist: number;
  /** Bot rifle: bots trade raw power for numbers, so a fair fight lasts a few seconds. */
  weapon: Weapon;
}

export const SKILLS: Record<Difficulty, BotSkill> = {
  easy: {
    reaction: 0.8,
    aimError: 0.1,
    turnSpeed: 2.4,
    burst: [2, 3],
    burstPause: [0.8, 1.3],
    viewDist: 11,
    weapon: { damage: 6, farDamage: 4, interval: 0.26, spread: 0.1 },
  },
  normal: {
    reaction: 0.45,
    aimError: 0.055,
    turnSpeed: 3.6,
    burst: [3, 4],
    burstPause: [0.55, 0.9],
    viewDist: 14,
    weapon: { damage: 8, farDamage: 5, interval: 0.22, spread: 0.07 },
  },
  hard: {
    reaction: 0.25,
    aimError: 0.028,
    turnSpeed: 5.2,
    burst: [3, 5],
    burstPause: [0.35, 0.6],
    viewDist: 18,
    weapon: { damage: 11, farDamage: 7, interval: 0.18, spread: 0.045 },
  },
};

/**
 * Fold a noisy "signal" of a target's position into the bot's memory, so idle bots
 * converge on the fight (used by modes as a periodic radar pulse, never exact).
 */
export function hintPosition(world: World, brain: BotBrain, x: number, y: number, noise: number, rng: Rng) {
  if (brain.state === "engage" || brain.state === "retreat") return;
  const hx = Math.min(world.map.width - 1.5, Math.max(1.5, x + (rng.next() - 0.5) * 2 * noise));
  const hy = Math.min(world.map.height - 1.5, Math.max(1.5, y + (rng.next() - 0.5) * 2 * noise));
  brain.lastSeen = { x: hx, y: hy, t: world.time };
  brain.state = "hunt";
  brain.path = [];
}

const FOV = (110 * Math.PI) / 180;
const HEAR_DIST = 2.5;
const MEMORY_S = 4;
const PREFERRED_RANGE: [number, number] = [3.5, 7.5];

export type BotState = "patrol" | "hunt" | "engage" | "retreat";

export interface BotBrain {
  state: BotState;
  skill: BotSkill;
  targetId: string | null;
  lastSeen: { x: number; y: number; t: number } | null;
  /** When the current target was first acquired (reaction timer). */
  acquiredAt: number;
  aimOffset: number;
  path: { x: number; y: number }[];
  strafeDir: number;
  strafeUntil: number;
  burstLeft: number;
  burstResumeAt: number;
  retreatUntil: number;
  stuckCheck: { x: number; y: number; t: number };
}

export function createBrain(skill: BotSkill, rng: Rng): BotBrain {
  return {
    state: "patrol",
    skill,
    targetId: null,
    lastSeen: null,
    acquiredAt: 0,
    aimOffset: 0,
    path: [],
    strafeDir: rng.next() < 0.5 ? -1 : 1,
    strafeUntil: 0,
    burstLeft: 0,
    burstResumeAt: 0,
    retreatUntil: 0,
    stuckCheck: { x: 0, y: 0, t: 0 },
  };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function canSee(world: World, bot: Entity, target: Entity, viewDist: number) {
  if (!target.alive) return false;
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy);
  if (dist > viewDist) return false;
  const inCone = Math.abs(wrapAngle(Math.atan2(dy, dx) - bot.angle)) <= FOV / 2;
  if (!inCone && dist > HEAR_DIST) return false;
  return lineOfSight(world.map, bot.x, bot.y, target.x, target.y);
}

function turnToward(bot: Entity, angle: number, rate: number, dt: number) {
  const diff = wrapAngle(angle - bot.angle);
  const step = rate * dt;
  bot.angle = wrapAngle(bot.angle + Math.max(-step, Math.min(step, diff)));
  return Math.abs(diff);
}

function followPath(world: World, bot: Entity, brain: BotBrain, dt: number, face = true) {
  const next = brain.path[0];
  if (!next) return;
  const dx = next.x - bot.x;
  const dy = next.y - bot.y;
  if (Math.hypot(dx, dy) < 0.2) {
    brain.path.shift();
    return;
  }
  const heading = Math.atan2(dy, dx);
  if (face) turnToward(bot, heading, brain.skill.turnSpeed * 1.5, dt);
  // Move in world space toward the waypoint regardless of facing.
  const rel = wrapAngle(heading - bot.angle);
  move(world, bot, Math.cos(rel), Math.sin(rel), dt, 2.8);
}

function goTo(world: World, bot: Entity, brain: BotBrain, x: number, y: number) {
  brain.path = findPath(world.map, bot.x, bot.y, x, y) ?? [];
}

function pickPatrolGoal(world: World, bot: Entity, brain: BotBrain, rng: Rng) {
  const cells = floorCells(world.map);
  for (let i = 0; i < 8; i++) {
    const c = rng.pick(cells);
    if (Math.hypot(c.x - bot.x, c.y - bot.y) > 5) {
      goTo(world, bot, brain, c.x + 0.5, c.y + 0.5);
      if (brain.path.length) return;
    }
  }
}

function pickCover(world: World, bot: Entity, brain: BotBrain, threat: { x: number; y: number }, rng: Rng) {
  const cells = floorCells(world.map);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 30; i++) {
    const c = rng.pick(cells);
    const cx = c.x + 0.5;
    const cy = c.y + 0.5;
    const d = Math.hypot(cx - bot.x, cy - bot.y);
    if (d > 9 || d < 1.5) continue;
    if (lineOfSight(world.map, threat.x, threat.y, cx, cy)) continue;
    if (d < bestD) {
      bestD = d;
      best = { x: cx, y: cy };
    }
  }
  if (best) goTo(world, bot, brain, best.x, best.y);
}

/** Choose the closest visible enemy, or the one that just shot us. */
function perceive(world: World, bot: Entity, brain: BotBrain) {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.entities.values()) {
    if (!isEnemy(bot, e) || !e.alive) continue;
    if (!canSee(world, bot, e, brain.skill.viewDist)) continue;
    const d = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  // Getting shot reveals the attacker's position (not a wallhack: they just fired at us).
  if (!best && bot.lastAttacker && world.time - bot.hurtAt < 0.2) {
    const a = world.entities.get(bot.lastAttacker);
    if (a?.alive) brain.lastSeen = { x: a.x, y: a.y, t: world.time };
  }
  return best;
}

/** Advance one bot by dt. Returns whether it fired (for sounds / netcode). */
export function updateBot(world: World, bot: Entity, brain: BotBrain, dt: number, rng: Rng): boolean {
  if (!bot.alive) {
    brain.state = "patrol";
    brain.path = [];
    brain.targetId = null;
    return false;
  }
  const s = brain.skill;
  const target = perceive(world, bot, brain);
  let fired = false;

  if (target) {
    if (brain.targetId !== target.id) {
      brain.targetId = target.id;
      brain.acquiredAt = world.time;
      brain.aimOffset = (rng.next() - 0.5) * 2 * s.aimError * 2;
    }
    brain.lastSeen = { x: target.x, y: target.y, t: world.time };
    if (brain.state !== "retreat") brain.state = "engage";
  } else if (brain.targetId) {
    brain.targetId = null;
    if (brain.state === "engage") brain.state = "hunt";
  }

  // Hurt and outgunned: fall back to cover for a bit.
  if (bot.hp < bot.maxHp * 0.3 && brain.state !== "retreat" && brain.lastSeen && rng.next() < 0.6 * dt * 10) {
    brain.state = "retreat";
    brain.retreatUntil = world.time + 3;
    pickCover(world, bot, brain, brain.lastSeen, rng);
  }

  switch (brain.state) {
    case "retreat": {
      if (world.time > brain.retreatUntil || brain.path.length === 0) {
        brain.state = target ? "engage" : "hunt";
        if (isReloading(world, bot) === false && bot.ammo < 12) startReload(world, bot);
      }
      followPath(world, bot, brain, dt, !target);
      if (target) turnToward(bot, Math.atan2(target.y - bot.y, target.x - bot.x), s.turnSpeed, dt);
      break;
    }
    case "engage": {
      if (!target) break;
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const dist = Math.hypot(dx, dy);
      // Aim drifts around the true angle; error shrinks the longer we track the target.
      const tracking = Math.min(1, (world.time - brain.acquiredAt) / 1.5);
      brain.aimOffset += (rng.next() - 0.5) * s.aimError * dt * 8;
      brain.aimOffset *= 1 - 0.5 * dt * (0.5 + tracking);
      brain.aimOffset = Math.max(-s.aimError * 2, Math.min(s.aimError * 2, brain.aimOffset));
      const aimErr = turnToward(bot, Math.atan2(dy, dx) + brain.aimOffset, s.turnSpeed, dt);

      if (world.time > brain.strafeUntil) {
        brain.strafeDir = rng.next() < 0.5 ? -1 : 1;
        brain.strafeUntil = world.time + rng.range(0.5, 1.2);
      }
      const fwd = dist > PREFERRED_RANGE[1] ? 1 : dist < PREFERRED_RANGE[0] ? -0.8 : 0;
      move(world, bot, fwd, brain.strafeDir * 0.8, dt, 2.4);

      const reacted = world.time - brain.acquiredAt >= s.reaction;
      const onTarget = aimErr < 0.06 + Math.atan2(0.3, Math.max(dist, 0.5));
      if (reacted && onTarget && world.time >= brain.burstResumeAt) {
        if (brain.burstLeft <= 0) brain.burstLeft = rng.int(s.burst[0], s.burst[1]);
        if (fire(world, bot, rng)) {
          fired = true;
          brain.burstLeft--;
          if (brain.burstLeft <= 0) brain.burstResumeAt = world.time + rng.range(s.burstPause[0], s.burstPause[1]);
        }
      }
      break;
    }
    case "hunt": {
      const ls = brain.lastSeen;
      if (!ls || world.time - ls.t > MEMORY_S) {
        brain.state = "patrol";
        brain.path = [];
        break;
      }
      if (brain.path.length === 0) {
        goTo(world, bot, brain, ls.x, ls.y);
        if (brain.path.length === 0) {
          // Arrived: look around, then give up.
          bot.angle += s.turnSpeed * 0.5 * dt;
          if (world.time - ls.t > MEMORY_S * 0.6) brain.lastSeen = null;
        }
      }
      followPath(world, bot, brain, dt);
      break;
    }
    case "patrol": {
      if (bot.ammo < 12 && !isReloading(world, bot)) startReload(world, bot);
      if (brain.lastSeen && world.time - brain.lastSeen.t < MEMORY_S) {
        brain.state = "hunt";
        brain.path = [];
        break;
      }
      if (brain.path.length === 0) pickPatrolGoal(world, bot, brain, rng);
      followPath(world, bot, brain, dt);
      break;
    }
  }

  // Unstick: if we meant to move but haven't for a second, pick a new route.
  if (world.time - brain.stuckCheck.t > 1) {
    if (Math.hypot(bot.x - brain.stuckCheck.x, bot.y - brain.stuckCheck.y) < 0.1 && brain.state !== "engage")
      brain.path = [];
    brain.stuckCheck = { x: bot.x, y: bot.y, t: world.time };
  }
  return fired;
}
