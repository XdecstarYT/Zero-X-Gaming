import type { Rng } from "../engine/rng";
import { CONSUMABLES, itemValue, weaponDef, type Item } from "./items";
import { floorCells, lineOfSight } from "./map";
import { findPath } from "./path";
import { outside, type Circle } from "./storm";
import {
  activeItem,
  activeWeapon,
  fire,
  interact,
  isEnemy,
  isReloading,
  MAX_SHIELD,
  move,
  nearestChest,
  startReload,
  switchSlot,
  type Entity,
  type World,
} from "./world";

/**
 * Bot AI: a state machine per bot.
 *   loot    → walk to a visible item / chest that improves the kit, grab it
 *   rotate  → the storm is coming: path into the safe circle
 *   heal    → out of danger and hurt: use a med kit / shield potion
 *   patrol  → wander between reachable cells (inside the safe zone)
 *   hunt    → go where an enemy was last seen / heard / signalled
 *   engage  → pick the right gun for the range, strafe, fire once "reacted"
 *   retreat → badly hurt: break line of sight
 * Perception is fair: a vision cone + line of sight, hearing up close, and
 * noticing who shot them. Difficulty changes reaction, aim, and a damage /
 * spread handicap only, never what the bot can know.
 */

export type Difficulty = "easy" | "normal" | "hard";

export interface BotSkill {
  reaction: number;
  aimError: number;
  turnSpeed: number;
  burst: [number, number];
  burstPause: [number, number];
  viewDist: number;
  damageMult: number;
  spreadMult: number;
}

export const SKILLS: Record<Difficulty, BotSkill> = {
  easy: {
    reaction: 0.8,
    aimError: 0.1,
    turnSpeed: 2.4,
    burst: [2, 3],
    burstPause: [0.8, 1.3],
    viewDist: 14,
    damageMult: 0.35,
    spreadMult: 2.4,
  },
  normal: {
    reaction: 0.5,
    aimError: 0.055,
    turnSpeed: 3.6,
    burst: [3, 4],
    burstPause: [0.55, 0.9],
    viewDist: 18,
    damageMult: 0.5,
    spreadMult: 1.8,
  },
  hard: {
    reaction: 0.3,
    aimError: 0.03,
    turnSpeed: 5,
    burst: [3, 5],
    burstPause: [0.35, 0.6],
    viewDist: 24,
    damageMult: 0.68,
    spreadMult: 1.35,
  },
};

const FOV = (110 * Math.PI) / 180;
const HEAR_DIST = 3;
const MEMORY_S = 5;
const LOOT_SIGHT = 14;

export type BotState = "loot" | "rotate" | "heal" | "patrol" | "hunt" | "engage" | "retreat";

export interface BotBrain {
  state: BotState;
  skill: BotSkill;
  targetId: string | null;
  lastSeen: { x: number; y: number; t: number } | null;
  acquiredAt: number;
  aimOffset: number;
  path: { x: number; y: number }[];
  goal: { x: number; y: number } | null;
  lootId: string | null;
  strafeDir: number;
  strafeUntil: number;
  burstLeft: number;
  burstResumeAt: number;
  retreatUntil: number;
  nextThink: number;
  stuckCheck: { x: number; y: number; t: number };
}

export interface BotEnv {
  /** The circle the storm is closing to (bots head inside it). */
  safe?: Circle;
  /** The storm's current edge (outside = taking damage). */
  storm?: Circle;
}

export function createBrain(skill: BotSkill, rng: Rng): BotBrain {
  return {
    state: "loot",
    skill,
    targetId: null,
    lastSeen: null,
    acquiredAt: 0,
    aimOffset: 0,
    path: [],
    goal: null,
    lootId: null,
    strafeDir: rng.next() < 0.5 ? -1 : 1,
    strafeUntil: 0,
    burstLeft: 0,
    burstResumeAt: 0,
    retreatUntil: 0,
    nextThink: 0,
    stuckCheck: { x: 0, y: 0, t: 0 },
  };
}

/** Apply a skill's handicaps to a bot entity. */
export function applySkill(bot: Entity, skill: BotSkill) {
  bot.damageMult = skill.damageMult;
  bot.spreadMult = skill.spreadMult;
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

/**
 * Fold a noisy "signal" of a target's position into the bot's memory, so idle
 * bots converge on the action (modes call this periodically; never exact).
 */
export function hintPosition(world: World, brain: BotBrain, x: number, y: number, noise: number, rng: Rng) {
  if (brain.state === "engage" || brain.state === "retreat" || brain.state === "heal") return;
  const hx = Math.min(world.map.width - 1.5, Math.max(1.5, x + (rng.next() - 0.5) * 2 * noise));
  const hy = Math.min(world.map.height - 1.5, Math.max(1.5, y + (rng.next() - 0.5) * 2 * noise));
  brain.lastSeen = { x: hx, y: hy, t: world.time };
  brain.state = "hunt";
  brain.path = [];
  brain.goal = null;
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
  if (Math.hypot(dx, dy) < 0.25) {
    brain.path.shift();
    return;
  }
  const heading = Math.atan2(dy, dx);
  if (face) turnToward(bot, heading, brain.skill.turnSpeed * 1.5, dt);
  const rel = wrapAngle(heading - bot.angle);
  move(world, bot, Math.cos(rel), Math.sin(rel), dt, 0.9);
}

function goTo(world: World, bot: Entity, brain: BotBrain, x: number, y: number) {
  brain.goal = { x, y };
  brain.path = findPath(world.map, bot.x, bot.y, x, y) ?? [];
  return brain.path.length > 0;
}

function randomCellIn(world: World, rng: Rng, circle?: Circle, avoid?: { x: number; y: number }) {
  const cells = floorCells(world.map);
  for (let i = 0; i < 30; i++) {
    const c = rng.pick(cells);
    const x = c.x + 0.5;
    const y = c.y + 0.5;
    if (circle && outside({ ...circle, r: circle.r * 0.8 }, x, y)) continue;
    if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 5) continue;
    return { x, y };
  }
  return circle ? { x: circle.x, y: circle.y } : rng.pick(cells);
}

function pickCover(world: World, bot: Entity, brain: BotBrain, threat: { x: number; y: number }, rng: Rng) {
  const cells = floorCells(world.map);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 40; i++) {
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

/** Best slot for a fight at this distance. */
export function chooseSlot(bot: Entity, dist: number): number {
  let best = -1;
  let bestScore = -Infinity;
  bot.inventory.forEach((it, i) => {
    if (it?.type !== "weapon") return;
    let s: number;
    switch (it.kind) {
      case "shotgun":
        s = dist < 5 ? 10 : dist < 8 ? 4 : 0;
        break;
      case "smg":
        s = dist < 10 ? 8 : 4;
        break;
      case "ar":
        s = dist < 22 ? 7 : 6;
        break;
      case "sniper":
        s = dist > 14 ? 9 : 2;
        break;
      case "dmr":
        s = dist > 10 ? 8 : 4;
        break;
      case "lmg":
        s = dist < 16 ? 7 : 5;
        break;
      default:
        s = 3;
    }
    s += itemValue(it) * 0.1;
    if (it.ammo === 0) s -= 3;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

function consumableSlot(bot: Entity, kind: "medkit" | "shield") {
  return bot.inventory.findIndex((it) => it?.type === "consumable" && it.kind === kind);
}

function wantsItem(bot: Entity, item: Item) {
  if (bot.inventory.some((s) => s === null)) return true;
  const worst = Math.min(...bot.inventory.map((s) => (s ? itemValue(s) : 0)));
  if (item.type === "consumable")
    return bot.inventory.some((s) => s?.type === "consumable" && s.kind === item.kind && s.count < CONSUMABLES[item.kind].stack);
  return itemValue(item) > worst + 0.5;
}

/** Choose the closest visible enemy. Getting shot reveals the shooter's position. */
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
  if (!best && bot.lastAttacker && world.time - bot.hurtAt < 0.2) {
    const a = world.entities.get(bot.lastAttacker);
    if (a?.alive) brain.lastSeen = { x: a.x, y: a.y, t: world.time };
  }
  return best;
}

/** Advance one bot by dt. Returns whether it fired (for sounds / netcode). */
export function updateBot(world: World, bot: Entity, brain: BotBrain, dt: number, rng: Rng, env: BotEnv = {}): boolean {
  if (!bot.alive) {
    brain.state = "loot";
    brain.path = [];
    brain.targetId = null;
    return false;
  }
  const s = brain.skill;
  const target = perceive(world, bot, brain);
  let fired = false;
  const inStorm = env.storm ? outside(env.storm, bot.x, bot.y) : false;
  const outOfSafe = env.safe ? outside({ ...env.safe, r: Math.max(1, env.safe.r - 1.5) }, bot.x, bot.y) : false;

  if (target) {
    if (brain.targetId !== target.id) {
      brain.targetId = target.id;
      brain.acquiredAt = world.time;
      brain.aimOffset = (rng.next() - 0.5) * 2 * s.aimError * 2;
    }
    brain.lastSeen = { x: target.x, y: target.y, t: world.time };
    if (brain.state !== "retreat" && !(inStorm && bot.hp < 40)) brain.state = "engage";
    bot.using = null;
  } else if (brain.targetId) {
    brain.targetId = null;
    bot.aiming = false;
    if (brain.state === "engage") brain.state = "hunt";
  }

  // Badly hurt in a fight: break line of sight.
  const ehp = bot.hp + bot.shield;
  if (ehp < 45 && brain.state === "engage" && brain.lastSeen && rng.next() < dt * 4) {
    brain.state = "retreat";
    brain.retreatUntil = world.time + 3;
    pickCover(world, bot, brain, brain.lastSeen, rng);
  }

  // Periodic re-planning for the non-combat states.
  if (!target && brain.state !== "retreat" && brain.state !== "heal" && world.time >= brain.nextThink) {
    brain.nextThink = world.time + 0.6 + rng.next() * 0.4;
    const hurt =
      (bot.hp < 75 && consumableSlot(bot, "medkit") >= 0) || (bot.shield < MAX_SHIELD - 45 && consumableSlot(bot, "shield") >= 0);
    if (inStorm || outOfSafe) {
      if (brain.state !== "rotate" || brain.path.length === 0) {
        brain.state = "rotate";
        const p = randomCellIn(world, rng, env.safe);
        goTo(world, bot, brain, p.x, p.y);
      }
    } else if (hurt && !(brain.lastSeen && world.time - brain.lastSeen.t < 2)) {
      brain.state = "heal";
      brain.path = [];
    } else if (brain.lastSeen && world.time - brain.lastSeen.t < MEMORY_S && brain.state === "hunt") {
      // keep hunting
    } else {
      // Loot anything worthwhile in sight, else wander.
      const chest = nearestChest(world, bot, LOOT_SIGHT);
      let goal: { x: number; y: number; id: string } | null = chest ? { x: chest.x, y: chest.y, id: chest.id } : null;
      if (!goal) {
        let bestV = 0;
        for (const l of world.loot.values()) {
          const d = Math.hypot(l.x - bot.x, l.y - bot.y);
          if (d > LOOT_SIGHT || !wantsItem(bot, l.item)) continue;
          if (env.safe && outside(env.safe, l.x, l.y)) continue;
          if (!lineOfSight(world.map, bot.x, bot.y, l.x, l.y)) continue;
          const v = itemValue(l.item) - d * 0.15;
          if (v > bestV) {
            bestV = v;
            goal = { x: l.x, y: l.y, id: l.id };
          }
        }
      }
      if (goal) {
        if (brain.lootId !== goal.id || brain.path.length === 0) {
          brain.state = "loot";
          brain.lootId = goal.id;
          goTo(world, bot, brain, goal.x, goal.y);
        }
      } else if (brain.state !== "patrol" || brain.path.length === 0) {
        brain.state = "patrol";
        brain.lootId = null;
        const p = randomCellIn(world, rng, env.safe, bot);
        goTo(world, bot, brain, p.x, p.y);
      }
    }
  }

  switch (brain.state) {
    case "retreat": {
      if (world.time > brain.retreatUntil || brain.path.length === 0) {
        brain.state = target ? "engage" : "heal";
        if (!isReloading(world, bot)) startReload(world, bot);
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
      const slot = chooseSlot(bot, dist);
      if (slot >= 0 && slot !== bot.active && world.time - bot.firedAt > 0.4) switchSlot(world, bot, slot);
      const w = activeWeapon(bot);
      bot.aiming = !!w && w.kind === "sniper" && dist > 10;

      const tracking = Math.min(1, (world.time - brain.acquiredAt) / 1.5);
      brain.aimOffset += (rng.next() - 0.5) * s.aimError * dt * 8;
      brain.aimOffset *= 1 - 0.5 * dt * (0.5 + tracking);
      brain.aimOffset = Math.max(-s.aimError * 2, Math.min(s.aimError * 2, brain.aimOffset));
      const aimErr = turnToward(bot, Math.atan2(dy, dx) + brain.aimOffset, s.turnSpeed, dt);

      if (world.time > brain.strafeUntil) {
        brain.strafeDir = rng.next() < 0.5 ? -1 : 1;
        brain.strafeUntil = world.time + rng.range(0.5, 1.2);
      }
      const ideal: [number, number] =
        w?.kind === "shotgun" ? [1.5, 4] : w?.kind === "sniper" ? [12, 30] : w?.kind === "dmr" ? [8, 22] : w?.kind === "smg" ? [3, 8] : [4, 12];
      const fwd = dist > ideal[1] ? 1 : dist < ideal[0] ? -0.8 : 0;
      move(world, bot, fwd, bot.aiming ? 0 : brain.strafeDir * 0.8, dt, 0.85);

      if (!w) break;
      if (w.ammo === 0) {
        startReload(world, bot);
        break;
      }
      const reacted = world.time - brain.acquiredAt >= s.reaction + (bot.aiming ? 0.35 : 0);
      const onTarget = aimErr < 0.06 + Math.atan2(0.3, Math.max(dist, 0.5));
      if (reacted && onTarget && world.time >= brain.burstResumeAt && dist < (weaponDef(w).range * 2.5 + 4)) {
        if (brain.burstLeft <= 0) brain.burstLeft = weaponDef(w).auto ? rng.int(s.burst[0], s.burst[1]) : 1;
        if (fire(world, bot, rng)) {
          fired = true;
          brain.burstLeft--;
          if (brain.burstLeft <= 0)
            brain.burstResumeAt =
              world.time + (weaponDef(w).auto ? rng.range(s.burstPause[0], s.burstPause[1]) : rng.range(0.1, 0.4));
        }
      }
      break;
    }
    case "heal": {
      if (bot.using) break;
      const needMed = bot.hp < bot.maxHp - 20 ? consumableSlot(bot, "medkit") : -1;
      const needShield = bot.shield < MAX_SHIELD - 20 ? consumableSlot(bot, "shield") : -1;
      const slot = needShield >= 0 ? needShield : needMed;
      if (slot < 0) {
        brain.state = "patrol";
        brain.path = [];
        brain.nextThink = 0;
        break;
      }
      if (bot.active !== slot) switchSlot(world, bot, slot);
      else if (activeItem(bot)?.type === "consumable") fire(world, bot, rng);
      break;
    }
    case "loot": {
      if (brain.path.length > 0) followPath(world, bot, brain, dt);
      else if (brain.lootId) {
        interact(world, bot, rng);
        brain.lootId = null;
        brain.nextThink = 0;
      }
      break;
    }
    case "hunt": {
      const ls = brain.lastSeen;
      if (!ls || world.time - ls.t > MEMORY_S) {
        brain.state = "patrol";
        brain.path = [];
        brain.nextThink = 0;
        break;
      }
      if (brain.path.length === 0) {
        goTo(world, bot, brain, ls.x, ls.y);
        if (brain.path.length === 0) {
          bot.angle += s.turnSpeed * 0.5 * dt;
          if (world.time - ls.t > MEMORY_S * 0.6) brain.lastSeen = null;
        }
      }
      followPath(world, bot, brain, dt);
      break;
    }
    case "rotate":
    case "patrol": {
      if (bot.active >= 0 && !activeWeapon(bot)) {
        const slot = chooseSlot(bot, 10);
        if (slot >= 0) switchSlot(world, bot, slot);
      }
      const w = activeWeapon(bot);
      if (w && w.ammo < weaponDef(w).mag * 0.5 && !isReloading(world, bot)) startReload(world, bot);
      followPath(world, bot, brain, dt);
      if (brain.path.length === 0) brain.nextThink = 0;
      break;
    }
  }

  // Unstick: meant to move but haven't for a second → re-plan.
  if (world.time - brain.stuckCheck.t > 1) {
    if (Math.hypot(bot.x - brain.stuckCheck.x, bot.y - brain.stuckCheck.y) < 0.1 && brain.state !== "engage" && brain.state !== "heal") {
      brain.path = [];
      brain.nextThink = 0;
    }
    brain.stuckCheck = { x: bot.x, y: bot.y, t: world.time };
  }
  return fired;
}
