import { createRng, type Rng } from "../engine/rng";
import { BATTLE_SECONDS, BUILDINGS, DEPLOY, GRID, SAPPER_DAMAGE, TROOPS, type BuildingDef, type BuildingType, type TroopType } from "./data";
import type { Army } from "./village";

/**
 * A raid: your troops against a base, simulated in fixed steps. Ground troops
 * path around buildings with A* on the tile grid, treating walls as passable
 * at a cost (so they go round if there's a gap, or smash through if not);
 * fliers go straight. Each troop picks the nearest building it prefers.
 * Defenses pick the nearest troop in range and fire real projectiles (mortar
 * shells arc and splash, the spire's lightning jumps). Destroying the Keep is
 * a star, 50% is a star, 100% is the third; loot comes out of storages and
 * collectors as you damage them. Pure and deterministic.
 */

export interface BaseBuilding {
  id: number;
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  gold?: number;
  mana?: number;
}

export interface Base {
  name: string;
  trophies: number;
  keep: number;
  buildings: BaseBuilding[];
}

export interface Target {
  id: number;
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  size: number;
  def: BuildingDef;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  gold: number;
  mana: number;
  takenGold: number;
  takenMana: number;
  cooldown: number;
  /** Turret facing (radians), for the view. */
  aim: number;
  /** Seconds since it last fired (view). */
  fired: number;
}

export interface Unit {
  id: number;
  type: TroopType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  flying: boolean;
  target: number;
  /** A wall in the way that we're breaking. */
  wall: number;
  path: { x: number; y: number }[];
  cooldown: number;
  repath: number;
  dead: boolean;
  /** Seconds since it last attacked (view). */
  hit: number;
  heading: number;
  clan: boolean;
}

export interface Projectile {
  id: number;
  kind: "ball" | "arrow" | "shell" | "bolt" | "fire" | "zap";
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  damage: number;
  splash: number;
  /** Hits a unit (defense fire) or a building (troop fire). */
  unit: number;
  building: number;
  air: boolean;
  from: number;
}

export type BattleEvent =
  | { kind: "deploy"; type: TroopType; x: number; y: number }
  | { kind: "destroyed"; id: number; type: BuildingType }
  | { kind: "fire"; id: number; type: BuildingType }
  | { kind: "boom"; x: number; y: number; r: number }
  | { kind: "died"; id: number; type: TroopType }
  | { kind: "star"; stars: number }
  | { kind: "end" };

export interface BattleResult {
  stars: number;
  destruction: number;
  gold: number;
  mana: number;
  used: Army;
  usedClan: boolean;
  /** Per building: what was taken (for applying a defence to a village). */
  taken: Map<number, { gold: number; mana: number }>;
}

const W = GRID + DEPLOY * 2;
const RESOURCE: BuildingType[] = ["goldMine", "manaWell", "goldVault", "manaVat", "keep"];

export class Battle {
  readonly base: Base;
  readonly rng: Rng;
  targets: Target[] = [];
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  events: BattleEvent[] = [];
  time = 0;
  ended = false;
  started = false;
  stars = 0;
  /** Troops left to deploy. */
  left: Army;
  /** Clan reinforcements, deployed together. */
  clan: Army;
  clanDeployed = false;
  used: Army;
  private occ: Int32Array;
  private nextId = 1;
  private byId = new Map<number, Target>();
  private nonWalls: number;
  private keepGone = false;
  private half = false;

  constructor(base: Base, army: Army, clan: Army, seed: number) {
    this.base = base;
    this.rng = createRng(seed);
    this.left = { ...army };
    this.clan = { ...clan };
    this.used = { brawler: 0, ranger: 0, raider: 0, brute: 0, sapper: 0, drake: 0 };
    this.occ = new Int32Array(W * W).fill(-1);
    for (const b of base.buildings) {
      const def = BUILDINGS[b.type];
      const st = def.levels[Math.max(0, b.level - 1)];
      const t: Target = { id: b.id, type: b.type, level: b.level, x: b.x, y: b.y, size: def.size, def, hp: st.hp, maxHp: st.hp, destroyed: false, gold: b.gold ?? 0, mana: b.mana ?? 0, takenGold: 0, takenMana: 0, cooldown: 0, aim: 0, fired: 9 };
      this.targets.push(t);
      this.byId.set(t.id, t);
      for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) this.occ[(b.y + dy + DEPLOY) * W + b.x + dx + DEPLOY] = b.id;
    }
    this.nonWalls = this.targets.filter((t) => t.type !== "wall").length;
  }

  private emit(e: BattleEvent) {
    this.events.push(e);
  }

  /** Can you drop troops here? Inside the map, and not right next to a building. */
  canDeploy(x: number, y: number) {
    if (x < -DEPLOY || y < -DEPLOY || x >= GRID + DEPLOY || y >= GRID + DEPLOY) return false;
    for (const t of this.targets) {
      if (t.destroyed) continue;
      if (x >= t.x - 1 && x < t.x + t.size + 1 && y >= t.y - 1 && y < t.y + t.size + 1) return false;
    }
    return true;
  }

  get destruction() {
    const gone = this.targets.filter((t) => t.destroyed && t.type !== "wall").length;
    return this.nonWalls ? Math.round((gone / this.nonWalls) * 100) : 0;
  }

  get remaining() {
    return (Object.keys(this.left) as TroopType[]).reduce((a, t) => a + this.left[t], 0) + (this.clanDeployed ? 0 : (Object.keys(this.clan) as TroopType[]).reduce((a, t) => a + this.clan[t], 0));
  }

  get loot() {
    return {
      gold: Math.floor(this.targets.reduce((a, t) => a + t.takenGold, 0)),
      mana: Math.floor(this.targets.reduce((a, t) => a + t.takenMana, 0)),
    };
  }

  get available() {
    return { gold: Math.floor(this.targets.reduce((a, t) => a + t.gold, 0)), mana: Math.floor(this.targets.reduce((a, t) => a + t.mana, 0)) };
  }

  deploy(type: TroopType, x: number, y: number, clan = false): boolean {
    if (this.ended) return false;
    if (!clan && this.left[type] <= 0) return false;
    if (!this.canDeploy(Math.floor(x), Math.floor(y))) return false;
    if (!clan) {
      this.left[type]--;
      this.used[type]++;
    }
    const d = TROOPS[type];
    this.units.push({ id: this.nextId++, type, x, y, hp: d.hp, maxHp: d.hp, flying: d.flying, target: -1, wall: -1, path: [], cooldown: 0.3 + this.rng.next() * 0.3, repath: 0, dead: false, hit: 9, heading: 0, clan });
    this.started = true;
    this.emit({ kind: "deploy", type, x, y });
    return true;
  }

  /** Drop the whole clan contingent at a spot. */
  deployClan(x: number, y: number) {
    if (this.clanDeployed || !this.canDeploy(Math.floor(x), Math.floor(y))) return false;
    for (const t of Object.keys(this.clan) as TroopType[]) for (let i = 0; i < this.clan[t]; i++) this.deploy(t, x + (this.rng.next() - 0.5) * 1.5, y + (this.rng.next() - 0.5) * 1.5, true);
    this.clanDeployed = true;
    return true;
  }

  /** Give up: the battle ends now. */
  surrender() {
    if (!this.ended) this.finish();
  }

  step(dt: number) {
    if (this.ended) return;
    if (this.started) this.time += dt;
    for (const u of this.units) if (!u.dead) this.stepUnit(u, dt);
    for (const t of this.targets) if (!t.destroyed && t.def.range) this.stepDefense(t, dt);
    this.stepProjectiles(dt);
    this.units = this.units.filter((u) => !u.dead || u.hit < 1.5);
    const alive = this.units.some((u) => !u.dead);
    if (this.time >= BATTLE_SECONDS || this.destruction >= 100 || (this.started && !alive && this.remaining === 0)) this.finish();
  }

  private finish() {
    this.ended = true;
    this.emit({ kind: "end" });
  }

  result(): BattleResult {
    const taken = new Map<number, { gold: number; mana: number }>();
    for (const t of this.targets) if (t.takenGold || t.takenMana) taken.set(t.id, { gold: Math.floor(t.takenGold), mana: Math.floor(t.takenMana) });
    return { stars: this.stars, destruction: this.destruction, ...this.loot, used: { ...this.used }, usedClan: this.clanDeployed, taken };
  }

  // ------------------------------------------------------------- troops

  /** Distance from (x, y) to a building's footprint. */
  private distTo(t: Target, x: number, y: number) {
    const dx = Math.max(t.x - x, 0, x - (t.x + t.size));
    const dy = Math.max(t.y - y, 0, y - (t.y + t.size));
    return Math.hypot(dx, dy);
  }

  private choose(u: Unit) {
    const d = TROOPS[u.type];
    const live = this.targets.filter((t) => !t.destroyed);
    let pool = live.filter((t) => t.type !== "wall");
    if (d.prefers === "walls") {
      const walls = live.filter((t) => t.type === "wall");
      if (walls.length) pool = walls;
    } else if (d.prefers === "resources") {
      const r = pool.filter((t) => RESOURCE.includes(t.type));
      if (r.length) pool = r;
    } else if (d.prefers === "defenses") {
      const r = pool.filter((t) => t.def.category === "defense");
      if (r.length) pool = r;
    }
    let best: Target | null = null;
    let bd = Infinity;
    for (const t of pool) {
      const dd = this.distTo(t, u.x, u.y) + this.rng.next() * 0.01;
      if (dd < bd) {
        bd = dd;
        best = t;
      }
    }
    u.target = best ? best.id : -1;
    u.wall = -1;
    u.path = best && !u.flying ? this.findPath(u, best) : [];
    u.repath = 2;
  }

  /** A* from the troop to any tile in range of the target; walls passable at a cost. */
  private findPath(u: Unit, t: Target) {
    const d = TROOPS[u.type];
    const sx = Math.floor(u.x) + DEPLOY;
    const sy = Math.floor(u.y) + DEPLOY;
    const N = W * W;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const cx = t.x + t.size / 2;
    const cy = t.y + t.size / 2;
    const h = (i: number) => Math.hypot((i % W) - DEPLOY + 0.5 - cx, Math.floor(i / W) - DEPLOY + 0.5 - cy);
    const start = Math.max(0, Math.min(W - 1, sy)) * W + Math.max(0, Math.min(W - 1, sx));
    g[start] = 0;
    open.push(start);
    const f = new Float32Array(N).fill(Infinity);
    f[start] = h(start);
    const reach = d.range + 0.45;
    let goal = -1;
    for (let iter = 0; iter < 6000 && open.length; iter++) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open.splice(bi, 1);
      if (closed[cur]) continue;
      closed[cur] = 1;
      const x = (cur % W) - DEPLOY + 0.5;
      const y = Math.floor(cur / W) - DEPLOY + 0.5;
      if (this.distTo(t, x, y) <= reach) {
        goal = cur;
        break;
      }
      const cxg = cur % W;
      const cyg = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cxg + dx;
          const ny = cyg + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          let cost = dx && dy ? 1.414 : 1;
          const occ = this.occ[ni];
          if (occ !== -1) {
            const b = this.byId.get(occ)!;
            if (!b.destroyed) {
              if (b.type !== "wall") continue;
              // Through a wall: worth it only if going round is much longer.
              cost += 10 + b.hp / 120;
            }
          }
          // No cutting corners past buildings.
          if (dx && dy && (this.solid(cxg + dx, cyg) || this.solid(cxg, cyg + dy))) continue;
          const ng = g[cur] + cost;
          if (ng < g[ni]) {
            g[ni] = ng;
            from[ni] = cur;
            f[ni] = ng + h(ni);
            open.push(ni);
          }
        }
    }
    if (goal < 0) return [];
    const path: { x: number; y: number }[] = [];
    for (let c = goal; c !== -1 && c !== start; c = from[c]) path.push({ x: (c % W) - DEPLOY + 0.5, y: Math.floor(c / W) - DEPLOY + 0.5 });
    return path.reverse();
  }

  private solid(gx: number, gy: number) {
    const o = this.occ[gy * W + gx];
    if (o === -1 || o === undefined) return false;
    const b = this.byId.get(o)!;
    return !b.destroyed && b.type !== "wall";
  }

  /** The intact wall on this tile, if any. */
  private wallAt(x: number, y: number) {
    const gx = Math.floor(x) + DEPLOY;
    const gy = Math.floor(y) + DEPLOY;
    if (gx < 0 || gy < 0 || gx >= W || gy >= W) return null;
    const o = this.occ[gy * W + gx];
    if (o === -1) return null;
    const b = this.byId.get(o)!;
    return !b.destroyed && b.type === "wall" ? b : null;
  }

  private stepUnit(u: Unit, dt: number) {
    const d = TROOPS[u.type];
    u.hit += dt;
    u.cooldown -= dt;
    u.repath -= dt;
    let t = this.byId.get(u.target);
    if (!t || t.destroyed) {
      this.choose(u);
      t = this.byId.get(u.target);
      if (!t) return;
    }
    // Breaking a wall in the way.
    const wall = u.wall >= 0 ? this.byId.get(u.wall) : undefined;
    const victim = wall && !wall.destroyed ? wall : t;
    if (wall && wall.destroyed) {
      u.wall = -1;
      u.path = this.findPath(u, t);
    }
    const inRange = this.distTo(victim, u.x, u.y) <= d.range + 0.35;
    if (inRange) {
      u.heading = Math.atan2(victim.y + victim.size / 2 - u.y, victim.x + victim.size / 2 - u.x);
      if (u.cooldown <= 0) this.attack(u, victim);
      return;
    }
    // Move: fliers straight, walkers along the path.
    let gx = victim.x + victim.size / 2;
    let gy = victim.y + victim.size / 2;
    if (!u.flying) {
      if (!u.path.length) {
        if (u.repath <= 0) {
          u.path = this.findPath(u, t);
          u.repath = 1;
        }
        if (!u.path.length) return;
      }
      const next = u.path[0];
      const w = this.wallAt(next.x, next.y);
      if (w && d.prefers !== "walls") {
        u.wall = w.id;
        return;
      }
      gx = next.x;
      gy = next.y;
      if (Math.hypot(gx - u.x, gy - u.y) < 0.15) {
        u.path.shift();
        return;
      }
    }
    const dx = gx - u.x;
    const dy = gy - u.y;
    const l = Math.hypot(dx, dy) || 1;
    const step = Math.min(l, d.speed * dt);
    u.x += (dx / l) * step;
    u.y += (dy / l) * step;
    u.heading = Math.atan2(dy, dx);
  }

  private attack(u: Unit, t: Target) {
    const d = TROOPS[u.type];
    u.cooldown = 1;
    u.hit = 0;
    if (u.type === "sapper") {
      // The charge: big damage to walls nearby, a little to anything else; the sapper's gone.
      const cx = u.x;
      const cy = u.y;
      for (const b of this.targets) if (!b.destroyed && this.distTo(b, cx, cy) <= (d.splash ?? 1.5)) this.damage(b, b.type === "wall" ? SAPPER_DAMAGE : 40);
      this.emit({ kind: "boom", x: cx, y: cy, r: d.splash ?? 1.5 });
      u.dead = true;
      u.hit = 0;
      this.emit({ kind: "died", id: u.id, type: u.type });
      return;
    }
    const mult = (d.prefers === "resources" && RESOURCE.includes(t.type)) || (d.prefers === "defenses" && t.def.category === "defense") ? d.bonus : 1;
    const dmg = d.dps * mult;
    if (d.range > 1.5 || d.flying) {
      // Arrows and fire: a projectile that lands in a moment.
      const tx = Math.max(t.x, Math.min(t.x + t.size, u.x));
      const ty = Math.max(t.y, Math.min(t.y + t.size, u.y));
      this.projectiles.push({ id: this.nextId++, kind: u.type === "drake" ? "fire" : "arrow", x: u.x, y: u.y, z: u.flying ? 3 : 0.9, sx: u.x, sy: u.y, tx, ty, t: 0, dur: Math.max(0.15, Math.hypot(tx - u.x, ty - u.y) / 14), damage: dmg, splash: d.splash ?? 0, unit: -1, building: t.id, air: false, from: u.id });
    } else this.damage(t, dmg);
  }

  private damage(t: Target, dmg: number) {
    if (t.destroyed) return;
    const real = Math.min(t.hp, dmg);
    t.hp -= real;
    const k = real / t.maxHp;
    t.takenGold += t.gold * k;
    t.takenMana += t.mana * k;
    if (t.hp <= 0.001) {
      t.destroyed = true;
      t.takenGold = t.gold;
      t.takenMana = t.mana;
      this.emit({ kind: "destroyed", id: t.id, type: t.type });
      this.checkStars(t);
    }
  }

  private checkStars(t: Target) {
    let s = 0;
    if (t.type === "keep") this.keepGone = true;
    if (this.keepGone) s++;
    if (this.destruction >= 50) {
      this.half = true;
    }
    if (this.half) s++;
    if (this.destruction >= 100) s++;
    if (s > this.stars) {
      this.stars = s;
      this.emit({ kind: "star", stars: s });
    }
  }

  // ----------------------------------------------------------- defenses

  private stepDefense(t: Target, dt: number) {
    const def = t.def;
    t.cooldown -= dt;
    t.fired += dt;
    const cx = t.x + t.size / 2;
    const cy = t.y + t.size / 2;
    let best: Unit | null = null;
    let bd = Infinity;
    for (const u of this.units) {
      if (u.dead) continue;
      if (def.targets === "ground" && u.flying) continue;
      if (def.targets === "air" && !u.flying) continue;
      const dd = Math.hypot(u.x - cx, u.y - cy);
      if (dd > (def.range ?? 0) || dd < (def.minRange ?? 0)) continue;
      if (dd < bd) {
        bd = dd;
        best = u;
      }
    }
    if (!best) return;
    const want = Math.atan2(best.y - cy, best.x - cx);
    t.aim += Math.atan2(Math.sin(want - t.aim), Math.cos(want - t.aim)) * Math.min(1, dt * 10);
    if (t.cooldown > 0) return;
    t.cooldown = 1 / (def.rate ?? 1);
    t.fired = 0;
    const dmg = def.levels[t.level - 1].damage ?? 10;
    const kind: Projectile["kind"] = t.type === "cannon" ? "ball" : t.type === "archerTower" ? "arrow" : t.type === "mortar" ? "shell" : t.type === "spire" ? "zap" : "bolt";
    const speed = kind === "shell" ? 0 : kind === "zap" ? 0 : kind === "ball" ? 15 : 24;
    const dist = Math.hypot(best.x - cx, best.y - cy);
    const dur = kind === "shell" ? 1.7 : kind === "zap" ? 0.08 : dist / speed;
    // Mortars aim where the troop is now; everything else is homing.
    this.projectiles.push({ id: this.nextId++, kind, x: cx, y: cy, z: t.type === "archerTower" ? 4 : 1.6, sx: cx, sy: cy, tx: best.x, ty: best.y, t: 0, dur, damage: dmg, splash: def.splash ?? 0, unit: kind === "shell" ? -1 : best.id, building: -1, air: best.flying, from: t.id });
    this.emit({ kind: "fire", id: t.id, type: t.type });
  }

  private stepProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.t += dt;
      const u = p.unit >= 0 ? this.units.find((x) => x.id === p.unit && !x.dead) : undefined;
      if (u) {
        p.tx = u.x;
        p.ty = u.y;
      }
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k < 1) {
        keep.push(p);
        continue;
      }
      // Impact.
      if (p.building >= 0) {
        const b = this.byId.get(p.building);
        if (b) {
          this.damage(b, p.damage);
          if (p.splash) for (const o of this.targets) if (o !== b && !o.destroyed && o.type !== "wall" && this.distTo(o, p.tx, p.ty) <= p.splash) this.damage(o, p.damage * 0.6);
        }
        continue;
      }
      const hits = p.splash ? this.units.filter((x) => !x.dead && Math.hypot(x.x - p.tx, x.y - p.ty) <= p.splash && (p.kind !== "shell" || !x.flying)) : u ? [u] : [];
      for (const h of hits) {
        h.hp -= p.damage;
        if (h.hp <= 0 && !h.dead) {
          h.dead = true;
          h.hit = 0;
          this.emit({ kind: "died", id: h.id, type: h.type });
        }
      }
      if (p.splash) this.emit({ kind: "boom", x: p.tx, y: p.ty, r: p.splash });
    }
    this.projectiles = keep;
  }

  // ----------------------------------------------------------------- AI

  /**
   * An AI raid (for defences while you're away, and for tests): troops split
   * into a few waves from the side nearest the Keep, sappers first at the
   * walls, brutes leading, rangers behind.
   */
  autoDeploy(at: number) {
    const side = Math.floor(this.rng.next() * 4);
    const spot = (k: number) => {
      const along = 6 + k * (GRID - 12);
      const p = [
        [along, -2],
        [GRID + 1, along],
        [along, GRID + 1],
        [-2, along],
      ][side];
      return { x: p[0] + (this.rng.next() - 0.5) * 3, y: p[1] + (this.rng.next() - 0.5) * 3 };
    };
    const order: TroopType[] = ["brute", "sapper", "brawler", "drake", "raider", "ranger"];
    const wave = Math.floor(at);
    for (const t of order) {
      if (this.left[t] <= 0) continue;
      const n = Math.min(this.left[t], t === "brute" || t === "drake" ? 1 : 4);
      for (let i = 0; i < n; i++) {
        const s = spot(((wave + i) % 5) / 4);
        if (!this.deploy(t, s.x, s.y)) {
          // Nudge outward until it's legal.
          for (let r = 1; r < 6; r++) if (this.deploy(t, s.x + (side === 3 ? -r : side === 1 ? r : 0), s.y + (side === 0 ? -r : side === 2 ? r : 0))) break;
        }
      }
      return;
    }
  }
}

/** Trophies for a raid: a win scales with stars; a loss costs. */
export function trophyDelta(stars: number, myTrophies: number, theirTrophies: number) {
  const diff = Math.max(-200, Math.min(200, theirTrophies - myTrophies));
  const win = Math.round(Math.max(5, 18 + diff / 20));
  const loss = Math.round(Math.max(4, 12 - diff / 25));
  return stars === 0 ? -loss : Math.round((win * (stars + 1)) / 3);
}

/** Run a whole AI raid headlessly (defence logs, tests). */
export function simulateRaid(base: Base, army: Army, seed: number) {
  const b = new Battle(base, army, { brawler: 0, ranger: 0, raider: 0, brute: 0, sapper: 0, drake: 0 }, seed);
  let w = 0;
  for (let i = 0; i < BATTLE_SECONDS * 30 && !b.ended; i++) {
    if (i % 20 === 0 && b.remaining > 0 && w < 40) b.autoDeploy(w++);
    b.step(1 / 30);
    b.events.length = 0;
  }
  if (!b.ended) b.surrender();
  return b;
}
