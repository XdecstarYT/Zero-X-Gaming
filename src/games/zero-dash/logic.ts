import { createRng, type Rng } from "../engine/rng";

/** Zero Dash rules. Pure and deterministic (seeded), rendered by ./index.ts. */

export const W = 960;
export const H = 540;
export const GROUND_Y = 440;
export const PLAYER_X = 180;
export const PLAYER_SIZE = 36;

const GRAVITY = 2800;
const JUMP_VELOCITY = -880;
/** While jump is held (and rising) gravity is reduced, so holding jumps higher. */
const HOLD_GRAVITY_FACTOR = 0.45;
const MAX_HOLD_S = 0.22;
const JUMP_BUFFER_S = 0.12;
export const START_SPEED = 380;
const ACCEL = 10;
export const MAX_SPEED = 900;
export const MAX_MULTIPLIER = 5;
/** A jump is "tight" if taken this close (px) to the next obstacle. Clearing on a tight jump builds the combo. */
export const TIGHT_JUMP_PX = 110;
export const CLEAR_POINTS = 10;
const COLLISION_INSET = 5;

export interface Obstacle {
  x: number;
  w: number;
  h: number;
  cleared: boolean;
}

export interface DashState {
  rng: Rng;
  speed: number;
  distance: number;
  /** Top of the player box. */
  y: number;
  vy: number;
  onGround: boolean;
  holdTime: number;
  jumpBuffer: number;
  tightJump: boolean;
  obstacles: Obstacle[];
  nextSpawnIn: number;
  combo: number;
  bonus: number;
  dead: boolean;
}

export type DashEvent = "jump" | "land" | "clear" | "perfect" | "hit";

export interface DashInput {
  /** Jump key/pointer went down since the last step. */
  pressed: boolean;
  /** Jump key/pointer is currently held. */
  held: boolean;
}

export function createDash(seed = Date.now()): DashState {
  return {
    rng: createRng(seed),
    speed: START_SPEED,
    distance: 0,
    y: GROUND_Y - PLAYER_SIZE,
    vy: 0,
    onGround: true,
    holdTime: 0,
    jumpBuffer: 0,
    tightJump: false,
    obstacles: [],
    nextSpawnIn: 700,
    combo: 0,
    bonus: 0,
    dead: false,
  };
}

export function multiplier(s: Pick<DashState, "combo">): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(s.combo / 3));
}

export function score(s: Pick<DashState, "distance" | "bonus">): number {
  return Math.floor(s.distance / 10) + s.bonus;
}

function nextObstacle(s: DashState): Obstacle | undefined {
  return s.obstacles.find((o) => !o.cleared && o.x + o.w >= PLAYER_X);
}

export function overlaps(s: Pick<DashState, "y">, o: Obstacle): boolean {
  const px = PLAYER_X + COLLISION_INSET;
  const py = s.y + COLLISION_INSET;
  const size = PLAYER_SIZE - COLLISION_INSET * 2;
  const oy = GROUND_Y - o.h;
  return px < o.x + o.w && px + size > o.x && py < oy + o.h && py + size > oy;
}

export function step(s: DashState, dt: number, input: DashInput): DashEvent[] {
  const events: DashEvent[] = [];
  if (s.dead) return events;

  s.speed = Math.min(MAX_SPEED, s.speed + ACCEL * dt);
  const dx = s.speed * dt;
  s.distance += dx;

  // Jump (with a short input buffer so presses just before landing still count).
  if (input.pressed) s.jumpBuffer = JUMP_BUFFER_S;
  else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  if (s.onGround && s.jumpBuffer > 0) {
    s.vy = JUMP_VELOCITY;
    s.onGround = false;
    s.holdTime = 0;
    s.jumpBuffer = 0;
    const next = nextObstacle(s);
    s.tightJump = !!next && next.x - (PLAYER_X + PLAYER_SIZE) <= TIGHT_JUMP_PX;
    events.push("jump");
  }

  // Vertical physics.
  let g = GRAVITY;
  if (input.held && s.vy < 0 && s.holdTime < MAX_HOLD_S) {
    g *= HOLD_GRAVITY_FACTOR;
    s.holdTime += dt;
  }
  s.vy += g * dt;
  s.y += s.vy * dt;
  const floor = GROUND_Y - PLAYER_SIZE;
  if (s.y >= floor) {
    s.y = floor;
    s.vy = 0;
    if (!s.onGround) events.push("land");
    s.onGround = true;
  }

  // Obstacles scroll, clear, despawn.
  for (const o of s.obstacles) {
    o.x -= dx;
    if (!o.cleared && o.x + o.w < PLAYER_X) {
      o.cleared = true;
      if (s.tightJump) {
        s.combo += 1;
        events.push("perfect");
      } else {
        s.combo = 0;
        events.push("clear");
      }
      s.bonus += CLEAR_POINTS * multiplier(s);
    }
  }
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -60);

  // Spawn: gaps scale with speed so there's always time to land and jump again.
  s.nextSpawnIn -= dx;
  if (s.nextSpawnIn <= 0) {
    const wide = s.rng.next() < 0.2;
    s.obstacles.push(
      wide
        ? { x: W + 20, w: s.rng.range(70, 110), h: s.rng.range(34, 54), cleared: false }
        : { x: W + 20, w: s.rng.range(28, 52), h: s.rng.range(38, 86), cleared: false },
    );
    s.nextSpawnIn = s.rng.range(Math.max(300, s.speed * 0.75), s.speed * 1.4);
  }

  if (s.obstacles.some((o) => overlaps(s, o))) {
    s.dead = true;
    events.push("hit");
  }
  return events;
}
