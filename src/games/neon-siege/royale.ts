import { createRng, type Rng } from "../engine/rng";
import { applySkill, createBrain, hintPosition, SKILLS, updateBot, type BotBrain, type Difficulty } from "./bots";
import { makeWeapon, rollFloorLoot, SLOTS } from "./items";
import { seasonMap, type GameMap } from "./map";
import { createStorm, outside, stepStorm, type StormState } from "./storm";
import {
  activeWeapon,
  createEntity,
  createWorld,
  damage,
  drainEvents,
  dropInventory,
  fire,
  interact,
  move,
  spawnLoot,
  startReload,
  switchSlot,
  tickWorld,
  type Entity,
  type World,
  type WorldEvent,
} from "./world";

/**
 * Battle royale vs bots: you and 15 AI fighters drop onto Ground Zero with a
 * pistol each. Loot the town, open chests, stay ahead of the storm, be the
 * last one standing. Pure and seeded.
 */

export const FIELD_SIZE = 16;
export const PLAYER_ID = "you";
const HINT_PERIOD_S = 7;

export const BOT_NAMES = [
  "Hawk", "Viper", "Ghost", "Maverick", "Nova", "Ranger", "Blaze", "Frost",
  "Echo", "Raven", "Titan", "Onyx", "Jinx", "Rook", "Kilo", "Sable", "Dune", "Atlas",
];
export const BOT_OUTFITS = ["recruit", "ranger", "urban", "desert", "arctic", "crimson", "midnight", "jungle"];

export interface PlayerInput {
  forward: number;
  strafe: number;
  /** Radians to rotate this step (mouse / keys / touch already scaled). */
  turn: number;
  fire: boolean;
  reload: boolean;
  /** Aim down sights (held). */
  aim: boolean;
  /** Interact pressed this step (pick up / open chest). */
  interact: boolean;
  /** Select a hotbar slot this step. */
  slot: number | null;
  /** Realism modes (Trenches): sprint held, stance toggles pressed this step, dig held. */
  sprint?: boolean;
  crouch?: boolean;
  prone?: boolean;
  dig?: boolean;
  /** Throw a grenade (pressed this step). */
  throw?: boolean;
  /** Call in support (Trenches): pressed this step. */
  support?: "artillery" | "supply" | "recon" | "gas" | null;
  /** Bayonet / melee (pressed this step). */
  melee?: boolean;
  /** Gas mask on / off (pressed this step). */
  mask?: boolean;
}

export const IDLE: PlayerInput = {
  forward: 0,
  strafe: 0,
  turn: 0,
  fire: false,
  reload: false,
  aim: false,
  interact: false,
  slot: null,
};

export interface MatchStats {
  kills: number;
  placement: number;
  players: number;
  damage: number;
  chests: number;
  survivedS: number;
  difficulty: Difficulty;
}

export interface RoyaleState {
  rng: Rng;
  world: World;
  player: Entity;
  brains: Map<string, BotBrain>;
  difficulty: Difficulty;
  storm: StormState;
  phase: "playing" | "over";
  /** 1 = winner. Set when the player is eliminated or wins. */
  placement: number | null;
  alive: number;
  chestsOpened: number;
  stormAcc: Map<string, number>;
  endedAt: number;
  /** Storm clock multiplier (1 = normal; >1 only for quick test matches, which are unranked). */
  stormScale: number;
}

export function placementBonus(placement: number) {
  if (placement === 1) return 1000;
  if (placement <= 3) return 600;
  if (placement <= 5) return 400;
  if (placement <= 10) return 150;
  return 0;
}

export function royaleScore(s: Pick<RoyaleState, "player" | "placement" | "world" | "endedAt">) {
  const t = s.placement ? s.endedAt : s.world.time;
  return s.player.kills * 100 + (s.placement ? placementBonus(s.placement) : 0) + Math.floor(t) * 2;
}

export function createRoyale(
  difficulty: Difficulty = "normal",
  seed = Date.now(),
  opts: { outfit?: string; name?: string; map?: GameMap; field?: number; stormScale?: number } = {},
): RoyaleState {
  const rng = createRng(seed);
  const world = createWorld(opts.map ?? seasonMap());
  const field = Math.min(opts.field ?? FIELD_SIZE, world.map.spawns.length);
  for (const spot of world.map.lootSpots) spawnLoot(world, spot.x, spot.y, rollFloorLoot(rng));

  const spawns = [...world.map.spawns];
  for (let i = spawns.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
  }
  const center = { x: world.map.width / 2, y: world.map.height / 2 };
  const faceCenter = (e: Entity) => (e.angle = Math.atan2(center.y - e.y, center.x - e.x));

  const player = createEntity({
    id: PLAYER_ID,
    name: opts.name ?? "You",
    kind: "human",
    team: 0,
    x: spawns[0].x,
    y: spawns[0].y,
    outfit: opts.outfit ?? "recruit",
  });
  player.inventory[0] = makeWeapon("pistol", "common");
  faceCenter(player);
  world.entities.set(player.id, player);

  const brains = new Map<string, BotBrain>();
  const skill = SKILLS[difficulty];
  for (let i = 1; i < field; i++) {
    const id = `bot-${i}`;
    const bot = createEntity({
      id,
      name: BOT_NAMES[(i - 1) % BOT_NAMES.length],
      kind: "bot",
      team: i,
      x: spawns[i].x,
      y: spawns[i].y,
      outfit: BOT_OUTFITS[i % BOT_OUTFITS.length],
    });
    bot.inventory[0] = makeWeapon("pistol", "common");
    applySkill(bot, skill);
    faceCenter(bot);
    world.entities.set(id, bot);
    brains.set(id, createBrain(skill, rng));
  }

  return {
    rng,
    world,
    player,
    brains,
    difficulty,
    storm: createStorm(world.map.width, world.map.height, rng),
    phase: "playing",
    placement: null,
    alive: field,
    chestsOpened: 0,
    stormAcc: new Map(),
    endedAt: 0,
    stormScale: opts.stormScale ?? 1,
  };
}

export function applyPlayerInput(s: { world: World; rng: Rng }, p: Entity, input: PlayerInput, dt: number) {
  const { world } = s;
  if (!p.alive) return;
  if (input.slot !== null && input.slot >= 0 && input.slot < SLOTS) switchSlot(world, p, input.slot);
  p.angle += input.turn;
  p.aiming = input.aim && !!activeWeapon(p) && !p.using && p.reloadUntil <= world.time;
  move(world, p, input.forward, input.strafe, dt);
  if (input.reload) startReload(world, p);
  if (input.interact) interact(world, p, s.rng);
  if (input.fire) fire(world, p, s.rng);
}

export function stepRoyale(s: RoyaleState, dt: number, input: PlayerInput): WorldEvent[] {
  if (s.phase === "over") return [];
  const { world, player } = s;
  tickWorld(world, dt);
  stepStorm(s.storm, dt * s.stormScale, s.rng, world.map.width, world.map.height);

  applyPlayerInput(s, player, input, dt);

  // Storm damage (whole points, so events aren't spammed every frame).
  for (const e of world.entities.values()) {
    if (!e.alive || !outside(s.storm.current, e.x, e.y)) continue;
    const acc = (s.stormAcc.get(e.id) ?? 0) + s.storm.dps * dt;
    if (acc >= 1) {
      damage(world, e, { id: "storm" }, Math.floor(acc), "storm");
      s.stormAcc.set(e.id, acc - Math.floor(acc));
    } else s.stormAcc.set(e.id, acc);
  }

  // Bots, with a staggered noisy "signal" of the nearest enemy so the field converges.
  const env = { safe: s.storm.to, storm: s.storm.current };
  const living = [...world.entities.values()].filter((e) => e.alive);
  for (const [id, brain] of s.brains) {
    const b = world.entities.get(id);
    if (!b?.alive) continue;
    const phase = (Number(id.slice(4)) * 1.3) % HINT_PERIOD_S;
    if (Math.floor((world.time - phase) / HINT_PERIOD_S) !== Math.floor((world.time - dt - phase) / HINT_PERIOD_S)) {
      let near: Entity | null = null;
      let nd = Infinity;
      for (const e of living) {
        if (e.id === b.id) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < nd) {
          nd = d;
          near = e;
        }
      }
      if (near && nd < 30) hintPosition(world, brain, near.x, near.y, 5, s.rng);
    }
    updateBot(world, b, brain, dt, s.rng, env);
  }

  const events = drainEvents(world);
  for (const ev of events) {
    if (ev.type === "kill") {
      const victim = world.entities.get(ev.victim);
      if (victim) dropInventory(world, victim, s.rng);
      s.alive--;
      if (ev.victim === PLAYER_ID && s.phase === "playing") {
        s.placement = s.alive + 1;
        s.phase = "over";
        s.endedAt = world.time;
      }
    } else if (ev.type === "chest" && ev.by === PLAYER_ID) s.chestsOpened++;
  }
  if (s.phase === "playing" && s.alive <= 1 && player.alive) {
    s.placement = 1;
    s.phase = "over";
    s.endedAt = world.time;
  }
  return events;
}

export function matchStats(s: RoyaleState): MatchStats {
  return {
    kills: s.player.kills,
    placement: s.placement ?? s.alive,
    players: s.brains.size + 1,
    damage: s.player.damageDealt,
    chests: s.chestsOpened,
    survivedS: Math.floor(s.placement ? s.endedAt : s.world.time),
    difficulty: s.difficulty,
  };
}
