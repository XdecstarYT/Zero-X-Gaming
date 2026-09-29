import { createRng, type Rng } from "../engine/rng";
import { createBrain, hintPosition, SKILLS, updateBot, type BotBrain, type BotSkill, type Difficulty } from "./bots";
import { parseMap } from "./map";
import {
  createEntity,
  createWorld,
  drainEvents,
  fire,
  MAG_SIZE,
  move,
  pickSpawn,
  startReload,
  tickWorld,
  type Entity,
  type World,
  type WorldEvent,
} from "./world";

/**
 * Solo "Siege" mode: survive escalating waves of AI bots. One life.
 * Kills score 100 + 25 per wave (capped), clearing a wave adds a bonus
 * and heals. Pure and seeded.
 */

export const PLAYER_ID = "you";
export const INTERMISSION_S = 3;
export const SPAWN_INTERVAL_S = 1.2;
/** Drones get a noisy fix on the player's position this often (they're hunters, not wanderers). */
export const SIGNAL_PULSE_S = 4;
const SIGNAL_NOISE = 3;

export interface PlayerInput {
  forward: number;
  strafe: number;
  /** Radians to rotate this step (mouse / keys / touch already scaled). */
  turn: number;
  fire: boolean;
  reload: boolean;
}

export interface SoloState {
  rng: Rng;
  world: World;
  player: Entity;
  brains: Map<string, BotBrain>;
  difficulty: Difficulty;
  wave: number;
  toSpawn: number;
  nextSpawnAt: number;
  phase: "intermission" | "fighting" | "over";
  phaseUntil: number;
  score: number;
  kills: number;
  botSeq: number;
  removeAt: Map<string, number>;
}

export const killPoints = (wave: number) => 100 + 25 * Math.min(wave - 1, 8);
export const waveBonus = (wave: number) => 200 * Math.min(wave, 10);
export const waveSize = (wave: number) => Math.min(3 + wave, 12);
export const aliveCap = (wave: number) => Math.min(2 + Math.ceil(wave / 2), 6);
export const botHp = (wave: number) => 60 + 8 * Math.min(wave - 1, 10);

export function waveSkill(difficulty: Difficulty, wave: number): BotSkill {
  const base = SKILLS[difficulty];
  const k = Math.max(0.6, Math.pow(0.95, wave - 1));
  return { ...base, reaction: base.reaction * k, aimError: base.aimError * Math.max(0.65, Math.pow(0.96, wave - 1)) };
}

export function createSolo(difficulty: Difficulty = "normal", seed = Date.now()): SoloState {
  const rng = createRng(seed);
  const world = createWorld(parseMap());
  const spawn = world.map.spawns[0];
  const player = createEntity({ id: PLAYER_ID, name: "You", kind: "human", team: 0, x: spawn.x, y: spawn.y });
  player.angle = Math.atan2(world.map.height / 2 - spawn.y, world.map.width / 2 - spawn.x);
  world.entities.set(player.id, player);
  return {
    rng,
    world,
    player,
    brains: new Map(),
    difficulty,
    wave: 0,
    toSpawn: 0,
    nextSpawnAt: 0,
    phase: "intermission",
    phaseUntil: 1.5,
    score: 0,
    kills: 0,
    botSeq: 0,
    removeAt: new Map(),
  };
}

const bots = (s: SoloState) => [...s.world.entities.values()].filter((e) => e.kind === "bot");

function spawnBot(s: SoloState) {
  const id = `bot-${++s.botSeq}`;
  const bot = createEntity({ id, name: `Drone ${s.botSeq}`, kind: "bot", team: 1, x: 0, y: 0 });
  bot.maxHp = bot.hp = botHp(s.wave);
  bot.weapon = SKILLS[s.difficulty].weapon;
  const p = pickSpawn(s.world, bot, s.rng, 11);
  bot.x = p.x;
  bot.y = p.y;
  bot.angle = Math.atan2(s.player.y - p.y, s.player.x - p.x);
  s.world.entities.set(id, bot);
  s.brains.set(id, createBrain(waveSkill(s.difficulty, s.wave), s.rng));
}

export function stepSolo(s: SoloState, dt: number, input: PlayerInput): WorldEvent[] {
  if (s.phase === "over") return [];
  const { world, player } = s;
  tickWorld(world, dt);

  // Player
  player.angle += input.turn;
  move(world, player, input.forward, input.strafe, dt);
  if (input.reload) startReload(world, player);
  if (input.fire) fire(world, player, s.rng);

  // Waves
  if (s.phase === "intermission" && world.time >= s.phaseUntil) {
    s.wave++;
    s.phase = "fighting";
    s.toSpawn = waveSize(s.wave);
    s.nextSpawnAt = world.time;
    world.events.push({ type: "wave", wave: s.wave, cleared: false });
  }
  const living = bots(s).filter((b) => b.alive).length;
  if (s.phase === "fighting" && s.toSpawn > 0 && world.time >= s.nextSpawnAt && living < aliveCap(s.wave)) {
    spawnBot(s);
    s.toSpawn--;
    s.nextSpawnAt = world.time + SPAWN_INTERVAL_S;
  }

  // Bots (with a staggered signal pulse so idle drones close in on the player)
  for (const b of bots(s)) {
    const brain = s.brains.get(b.id);
    if (!brain) continue;
    const phase = (Number(b.id.slice(4)) * 0.7) % SIGNAL_PULSE_S;
    if (Math.floor((world.time - phase) / SIGNAL_PULSE_S) !== Math.floor((world.time - dt - phase) / SIGNAL_PULSE_S)) {
      hintPosition(world, brain, player.x, player.y, SIGNAL_NOISE, s.rng);
    }
    updateBot(world, b, brain, dt, s.rng);
  }

  const events = drainEvents(world);
  for (const ev of events) {
    if (ev.type === "kill") {
      if (ev.victim === PLAYER_ID) {
        s.phase = "over";
      } else if (ev.killer === PLAYER_ID) {
        s.kills++;
        s.score += killPoints(s.wave);
        s.removeAt.set(ev.victim, world.time + 1.2);
      }
    }
  }

  // Clear out fallen bots after a moment.
  for (const [id, t] of s.removeAt) {
    if (world.time >= t) {
      world.entities.delete(id);
      s.brains.delete(id);
      s.removeAt.delete(id);
    }
  }

  if (s.phase === "fighting" && s.toSpawn === 0 && bots(s).every((b) => !b.alive)) {
    s.score += waveBonus(s.wave);
    player.hp = Math.min(player.maxHp, player.hp + 35);
    player.ammo = MAG_SIZE;
    player.reloadUntil = 0;
    s.phase = "intermission";
    s.phaseUntil = world.time + INTERMISSION_S;
    events.push({ type: "wave", wave: s.wave, cleared: true });
  }
  return events;
}
