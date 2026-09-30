import { createRng, type Rng } from "../engine/rng";
import { applySkill, createBrain, hintPosition, SKILLS, updateBot, type BotBrain } from "../neon-siege/bots";
import { makeConsumable, makeWeapon, SLOTS } from "../neon-siege/items";
import type { Banner, Marker, ModeController, ModeStatus, ScoreRow } from "../neon-siege/mode";
import { electHost, type PeerInfo, type Transport } from "../neon-siege/net";
import { GROUND } from "../neon-siege/map";
import type { PlayerInput } from "../neon-siege/royale";
import {
  activeWeapon,
  createEntity,
  createWorld,
  damage,
  drainEvents,
  fire,
  move,
  RESPAWN_DELAY,
  startReload,
  switchSlot,
  tickWorld,
  type Entity,
  type World,
  type WorldEvent,
} from "../neon-siege/world";
import { battlefield, type Battlefield, type Team } from "./battlefield";
import { DEFAULT_FRONT, FRONTS, isFrontId } from "./fronts";
import { createConquest, onDeath, stepConquest, MATCH_SECONDS, type ConquestState } from "./conquest";
import type { LobbySnapshot, TEntState, TrenchClass, TrenchMsg } from "./protocol";

/**
 * A Trenches Conquest battle, over any Transport (Supabase / BroadcastChannel
 * for lobbies, an in-memory room for solo). Same ownership model as Neon Siege
 * online: each client owns its soldier and decides its own hits (sent to the
 * victim's owner); the host owns the bots, the flags and the tickets, and
 * broadcasts them. If the host leaves, the next-oldest peer takes over.
 */

export const TEAM_NAMES: Record<Team, string> = { 1: "Iron Legion", 2: "Crimson Front" };
export const TEAM_SHORT: Record<Team, string> = { 1: "LEGION", 2: "FRONT" };
export const TEAM_COLORS: Record<Team, string> = { 1: "#5b93ff", 2: "#ff5a4f" };
export const UNIFORMS: Record<Team, string> = { 1: "legion", 2: "front" };
const NEUTRAL = "#e8e4d8";
const SEND_INTERVAL = 1 / 15;
const CQ_INTERVAL = 0.25;
const OBJECTIVE_PERIOD = 5;
const MAX_HIT = 260;
/** Rounds hit hard: roughly 2–3 rifle hits kill, like the real thing. */
const LETHALITY = 2.2;
/** Seconds to dig one cell of trench (engineers dig three times as fast). */
export const DIG_SECONDS = 3.6;
const ENGINEER_DIG = 3;
const MAX_DUG = 4000;
const DIGS_INTERVAL = 5;
/** Sprint: seconds of stamina from full, and the speed boost. */
const SPRINT_SECONDS = 10;
const SPRINT_MULT = 1.65;
const STANCE_SPEED = [1, 0.5, 0.22];
const STANCE_SPREAD = [1, 0.7, 0.45];
const STANCES = ["STANDING", "CROUCHED", "PRONE"];
const BOT_NAMES = ["Hale", "Brooks", "Mercer", "Voss", "Keller", "Dunn", "Rook", "Carver", "Pike", "Sutter", "Lowe", "Grant", "Wolfe", "Marsh", "Reyes", "Holt"];
const BOT_CLASSES: TrenchClass[] = ["rifleman", "rifleman", "assault", "medic", "marksman", "rifleman", "engineer"];

/** Class loadouts, restocked on every redeploy. */
export function equipClass(e: Entity, cls: TrenchClass) {
  e.inventory = Array.from({ length: SLOTS }, () => null);
  switch (cls) {
    case "rifleman":
      e.inventory[0] = makeWeapon("ar", "rare");
      e.inventory[1] = makeWeapon("pistol", "uncommon");
      e.inventory[2] = makeConsumable("medkit", 1);
      break;
    case "assault":
      e.inventory[0] = makeWeapon("smg", "rare");
      e.inventory[1] = makeWeapon("shotgun", "rare");
      e.inventory[2] = makeConsumable("medkit", 1);
      break;
    case "medic":
      e.inventory[0] = makeWeapon("smg", "uncommon");
      e.inventory[1] = makeWeapon("pistol", "common");
      e.inventory[2] = makeConsumable("medkit", 3);
      e.inventory[3] = makeConsumable("shield", 1);
      break;
    case "marksman":
      e.inventory[0] = makeWeapon("sniper", "rare");
      e.inventory[1] = makeWeapon("pistol", "rare");
      e.inventory[2] = makeConsumable("medkit", 1);
      break;
    case "engineer":
      e.inventory[0] = makeWeapon("smg", "uncommon");
      e.inventory[1] = makeWeapon("shotgun", "uncommon");
      e.inventory[2] = makeConsumable("medkit", 1);
      break;
  }
  e.active = 0;
  e.stance = 0;
  e.stamina = 1;
}

export interface MatchOptions {
  /** Solo vs bots: the run ends after the results screen. */
  solo?: boolean;
  /** Lobby matches: called after the results screen to go back to the lobby. */
  onBackToLobby?: () => void;
  /** Peers already in the room (the lobby knows them before we subscribe). */
  roster?: PeerInfo[];
  myClass?: TrenchClass;
}

export class TrenchesMatch implements ModeController {
  readonly ranked = false;
  readonly showNames = true;
  readonly realism = true;
  readonly storm = null;
  readonly world: World;
  readonly me: Entity;
  readonly field: Battlefield;
  cq: ConquestState;
  private rng: Rng;
  private peers: PeerInfo[];
  private hostId: string | null = null;
  private brains = new Map<string, BotBrain>();
  private botClass = new Map<string, TrenchClass>();
  private targets = new Map<string, { x: number; y: number; a: number }>();
  private teams = new Map<string, Team>();
  private sendAcc = 0;
  private cqAcc = 0;
  private unsub: (() => void)[] = [];
  private startedAt = 0;
  private bannerMsg: Banner | null = null;
  private bannerUntil = 0;
  private lastOwners: number[] = [];
  private myClass: TrenchClass;
  private digCell = -1;
  private digK = 0;
  private digsAcc = 0;
  readonly m: number;

  constructor(
    private transport: Transport<TrenchMsg>,
    private snap: LobbySnapshot,
    private opts: MatchOptions = {},
  ) {
    this.m = snap.matchId;
    this.rng = createRng(snap.seed ^ hashId(transport.selfId));
    this.field = battlefield(isFrontId(snap.front) ? snap.front : DEFAULT_FRONT);
    this.world = createWorld(this.field.map);
    this.world.chests = [];
    this.cq = createConquest(this.field.flags);
    this.lastOwners = this.cq.flags.map(() => 0);
    for (const p of snap.players) this.teams.set(p.id, p.team);
    const mine = snap.players.find((p) => p.id === transport.selfId);
    const team: Team = mine?.team ?? 1;
    this.me = createEntity({
      id: transport.selfId,
      name: mine?.name ?? "You",
      kind: "human",
      team,
      x: 0,
      y: 0,
      outfit: UNIFORMS[team],
    });
    this.world.entities.set(this.me.id, this.me);
    this.myClass = opts.myClass ?? mine?.cls ?? "rifleman";
    this.spawn(this.me, this.myClass);
    this.world.cover = (shooter, target, dist, rng) => this.covered(shooter, target, dist, rng.next());
    this.world.events = [];
    this.world.onHit = (shooter, target, amount, weapon) => {
      if (this.owns(target.id)) return false;
      this.transport.send({ t: "hit", m: this.m, a: shooter.id, v: target.id, d: amount, w: weapon });
      return true;
    };
    this.peers = opts.roster ?? [];
    this.hostId = electHost(this.peers) ?? transport.selfId;
    this.unsub.push(
      transport.onPeers((p) => this.handlePeers(p)),
      transport.onMessage((msg, from) => this.handleMessage(msg, from)),
    );
    if (this.isHost) this.fillBots();
    const def = FRONTS[this.field.front];
    this.flash({ text: def.name.toUpperCase(), sub: `${def.place} · Conquest: capture and hold the flags. Every death costs a ticket.`, color: TEAM_COLORS[team] }, 5);
  }

  get isHost() {
    return this.hostId === this.me.id;
  }
  get myTeam(): Team {
    return this.me.team as Team;
  }

  private owns(id: string) {
    return id === this.me.id || (this.isHost && this.world.entities.get(id)?.kind === "bot");
  }

  private bots() {
    return [...this.world.entities.values()].filter((e) => e.kind === "bot");
  }

  // --------------------------------------------------------------- spawning

  private spawn(e: Entity, cls: TrenchClass) {
    const team = e.team as Team;
    const flags = this.cq.flags.filter((f) => f.owner === team);
    // Try a few spots and take the least crowded, so squads don't spawn inside each other.
    const atFlag = flags.length > 0 && this.rng.next() < 0.6;
    let best = { x: 0, y: 0 };
    let bestGap = -1;
    for (let i = 0; i < 6; i++) {
      let spot: { x: number; y: number };
      if (atFlag) {
        const f = this.rng.pick(flags);
        spot = this.openNear(f.x + this.rng.range(-1.5, 1.5), f.y + this.rng.range(-1.5, 1.5));
      } else {
        const b = this.rng.pick(this.field.bases[team - 1]);
        spot = { x: b.x + this.rng.range(-0.3, 0.3), y: b.y + this.rng.range(-0.3, 0.3) };
      }
      let gap = Infinity;
      for (const o of this.world.entities.values())
        if (o !== e && o.alive) gap = Math.min(gap, Math.hypot(o.x - spot.x, o.y - spot.y));
      if (gap > bestGap) {
        best = spot;
        bestGap = gap;
      }
      if (gap > 2.5) break;
    }
    const { x, y } = best;
    Object.assign(e, { x, y, hp: e.maxHp, shield: 0, alive: true, reloadUntil: 0, reloadSlot: -1, lastAttacker: null, using: null, aiming: false });
    e.angle = team === 1 ? 0 : Math.PI;
    equipClass(e, cls);
  }

  private openNear(x: number, y: number) {
    const map = this.world.map;
    for (let r = 0; r < 4; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const cx = Math.floor(x) + dx;
          const cy = Math.floor(y) + dy;
          if (cx > 0 && cy > 0 && cx < map.width - 1 && cy < map.height - 1 && map.cells[cy * map.width + cx] === 0)
            return { x: cx + 0.5, y: cy + 0.5 };
        }
    return { x, y };
  }

  // ------------------------------------------------------------------- bots

  private fillBots() {
    if (!this.snap.bots) return;
    const humans = this.snap.players.length;
    const want = Math.max(0, this.snap.max - humans);
    const count: Record<Team, number> = { 1: 0, 2: 0 };
    for (const p of this.snap.players) count[p.team]++;
    for (const b of this.bots()) count[b.team as Team]++;
    for (let i = this.bots().length; i < want; i++) {
      const team: Team = count[1] <= count[2] ? 1 : 2;
      count[team]++;
      const id = `bot-${this.m}-${i}`;
      const name = `${team === 1 ? "Pvt." : "Cpl."} ${BOT_NAMES[i % BOT_NAMES.length]}`;
      const b = createEntity({ id, name, kind: "bot", team, x: 0, y: 0, outfit: UNIFORMS[team] });
      this.teams.set(id, team);
      this.world.entities.set(id, b);
      const cls = BOT_CLASSES[i % BOT_CLASSES.length];
      this.botClass.set(id, cls);
      this.spawn(b, cls);
      this.adoptBot(b);
    }
  }

  private adoptBot(b: Entity) {
    applySkill(b, SKILLS.normal);
    b.damageMult = SKILLS.normal.damageMult * LETHALITY;
    if (!b.inventory.some(Boolean)) equipClass(b, this.botClass.get(b.id) ?? "rifleman");
    this.targets.delete(b.id);
    if (!this.brains.has(b.id)) this.brains.set(b.id, createBrain(SKILLS.normal, this.rng));
  }

  // --------------------------------------------------------------- network

  private handlePeers(peers: PeerInfo[]) {
    this.peers = peers;
    const ids = new Set(peers.map((p) => p.id));
    for (const e of [...this.world.entities.values()])
      if (e.kind === "human" && e.id !== this.me.id && !ids.has(e.id)) {
        this.world.entities.delete(e.id);
        this.targets.delete(e.id);
      }
    const newHost = electHost(peers) ?? this.me.id;
    if (newHost !== this.hostId) {
      this.hostId = newHost;
      if (this.isHost) for (const b of this.bots()) this.adoptBot(b);
      else this.brains.clear();
    }
  }

  private handleMessage(msg: TrenchMsg, from: string) {
    if ("m" in msg && msg.m !== this.m) return; // another battle's traffic
    switch (msg.t) {
      case "state": {
        if (msg.bots && this.isHost && from !== this.hostId) return;
        const seen = new Set<string>();
        for (const es of msg.e) {
          seen.add(es.id);
          if (!this.owns(es.id)) this.applyState(es);
        }
        if (msg.bots && !this.isHost) for (const b of this.bots()) if (!seen.has(b.id)) this.world.entities.delete(b.id);
        break;
      }
      case "shot": {
        if (this.owns(msg.s)) break;
        const shooter = this.world.entities.get(msg.s);
        if (shooter) shooter.firedAt = this.world.time;
        this.world.events.push({ type: "shot", shooter: msg.s, weapon: msg.w, hit: null, fromX: msg.fx, fromY: msg.fy, toX: msg.tx, toY: msg.ty });
        break;
      }
      case "hit": {
        const victim = this.world.entities.get(msg.v);
        if (!victim || !this.owns(victim.id) || this.isOver()) return;
        const attacker = this.world.entities.get(msg.a) ?? { id: msg.a };
        // Friendly fire is off: ignore hits from teammates.
        if ("team" in attacker && attacker.team === victim.team) return;
        damage(this.world, victim, attacker, Math.max(0, Math.min(MAX_HIT, msg.d)), msg.w);
        break;
      }
      case "kill": {
        const killer = this.world.entities.get(msg.k);
        if (killer && this.owns(killer.id)) killer.kills++;
        this.world.events.push({ type: "kill", killer: msg.k, victim: msg.v, weapon: msg.w });
        if (this.isHost) {
          const team = this.teams.get(msg.v);
          if (team) onDeath(this.cq, team);
          this.sendCq();
        }
        break;
      }
      case "dig":
        if (Number.isInteger(msg.c)) this.applyDig(msg.c, false);
        break;
      case "digs":
        if (from !== this.hostId || !Array.isArray(msg.c)) return;
        for (const c of msg.c.slice(0, MAX_DUG)) if (Number.isInteger(c)) this.applyDig(c, false);
        break;
      case "cq":
        if (from !== this.hostId) return;
        this.cq.tickets = msg.tk;
        msg.f.forEach(([p, owner], i) => {
          const f = this.cq.flags[i];
          if (!f) return;
          f.p = p;
          f.owner = owner as 0 | Team;
        });
        this.cq.time = msg.time;
        this.cq.winner = msg.win as ConquestState["winner"];
        break;
    }
  }

  private applyState(es: TEntState) {
    let e = this.world.entities.get(es.id);
    if (!e) {
      e = createEntity({ id: es.id, name: es.n, kind: es.k, team: es.tm, x: es.x, y: es.y, outfit: UNIFORMS[es.tm] });
      e.angle = es.a;
      this.world.entities.set(es.id, e);
      this.teams.set(es.id, es.tm);
    }
    const wasAlive = e.alive;
    e.name = es.n;
    e.team = es.tm;
    e.outfit = UNIFORMS[es.tm];
    e.kills = es.ki;
    e.deaths = es.de;
    if (es.hp < e.hp) e.hurtAt = this.world.time;
    e.hp = es.hp;
    e.shield = es.sh;
    e.alive = es.al;
    e.aiming = es.ad;
    e.stance = es.st === 1 || es.st === 2 ? es.st : 0;
    const held = e.inventory[0];
    if (!es.w) e.inventory[0] = null;
    else if (held?.type !== "weapon" || held.kind !== es.w || held.rarity !== es.r) e.inventory[0] = makeWeapon(es.w, es.r ?? "common");
    e.active = 0;
    if (!wasAlive && es.al) {
      e.x = es.x;
      e.y = es.y;
      e.angle = es.a;
    }
    if (wasAlive && !es.al) e.hurtAt = this.world.time;
    this.targets.set(es.id, { x: es.x, y: es.y, a: es.a });
  }

  private snapshotOf(e: Entity): TEntState {
    const r = (v: number) => Math.round(v * 100) / 100;
    const w = activeWeapon(e);
    return {
      id: e.id,
      n: e.name,
      k: e.kind,
      tm: e.team as Team,
      x: r(e.x),
      y: r(e.y),
      a: r(e.angle),
      hp: e.hp,
      sh: e.shield,
      al: e.alive,
      ki: e.kills,
      de: e.deaths,
      w: w?.kind ?? null,
      r: w?.rarity ?? null,
      ad: e.aiming,
      sp: Math.round(e.speed * 10) / 10,
      st: e.stance ?? 0,
    };
  }

  private sendState() {
    this.transport.send({ t: "state", m: this.m, e: [this.snapshotOf(this.me)] });
    if (this.isHost) this.transport.send({ t: "state", m: this.m, e: this.bots().map((b) => this.snapshotOf(b)), bots: true });
  }

  private sendCq() {
    this.transport.send({
      t: "cq",
      m: this.m,
      tk: this.cq.tickets,
      f: this.cq.flags.map((f) => [Math.round(f.p * 100) / 100, f.owner]),
      time: Math.round(this.cq.time),
      win: this.cq.winner,
    });
  }

  // ------------------------------------------------------------------ tick

  step(dt: number, input: PlayerInput): WorldEvent[] {
    const w = this.world;
    tickWorld(w, dt);
    if (this.startedAt === 0) this.startedAt = w.time || 0.001;
    const over = this.isOver();

    if (!over) {
      this.applyInput(input, dt);
      if (!this.me.alive && w.time >= this.me.respawnAt) this.spawn(this.me, this.myClass);
    } else this.digCell = -1;

    // Interpolate remote soldiers.
    const k = 1 - Math.exp(-15 * dt);
    for (const [id, t] of this.targets) {
      const e = w.entities.get(id);
      if (!e) {
        this.targets.delete(id);
        continue;
      }
      const nx = e.x + (t.x - e.x) * k;
      const ny = e.y + (t.y - e.y) * k;
      e.speed = Math.hypot(nx - e.x, ny - e.y) / Math.max(dt, 1e-6);
      e.x = nx;
      e.y = ny;
      e.angle += Math.atan2(Math.sin(t.a - e.angle), Math.cos(t.a - e.angle)) * k;
    }

    if (this.isHost && !over) this.hostTick(dt);
    else if (!over) this.cq.time += dt;
    else if (this.isHost) {
      // Keep announcing the result so every client (and late joiners) sees the end.
      this.cqAcc += dt;
      if (this.cqAcc >= 1) {
        this.cqAcc = 0;
        this.sendCq();
      }
    }

    const events = drainEvents(w);
    for (const ev of events) {
      if (ev.type === "shot" && this.owns(ev.shooter)) {
        const r = (v: number) => Math.round(v * 100) / 100;
        this.transport.send({ t: "shot", m: this.m, s: ev.shooter, w: ev.weapon, fx: r(ev.fromX), fy: r(ev.fromY), tx: r(ev.toX), ty: r(ev.toY) });
      } else if (ev.type === "kill" && this.owns(ev.victim)) {
        this.transport.send({ t: "kill", m: this.m, k: ev.killer, v: ev.victim, w: ev.weapon });
        if (this.isHost) {
          const team = this.teams.get(ev.victim);
          if (team) onDeath(this.cq, team);
          this.sendCq();
        }
        this.sendAcc = SEND_INTERVAL;
      }
    }

    // Flag ownership changes → banners (works for host and clients alike).
    this.cq.flags.forEach((f, i) => {
      if (f.owner !== this.lastOwners[i]) {
        if (f.owner) {
          const ours = f.owner === this.myTeam;
          this.flash({ text: `${ours ? "WE TOOK" : "WE LOST"} ${f.id}`, sub: `${TEAM_NAMES[f.owner]} hold flag ${f.id}`, color: TEAM_COLORS[f.owner] }, 2.5);
        }
        this.lastOwners[i] = f.owner;
      }
    });

    this.sendAcc += dt;
    if (this.sendAcc >= SEND_INTERVAL) {
      this.sendAcc = 0;
      this.sendState();
    }
    return events;
  }

  private hostTick(dt: number) {
    const w = this.world;
    this.fillBots();
    const living = [...w.entities.values()];
    for (const b of this.bots()) {
      if (!this.brains.has(b.id)) this.adoptBot(b);
      const brain = this.brains.get(b.id)!;
      if (!b.alive) {
        if (w.time >= b.respawnAt) this.spawn(b, this.botClass.get(b.id) ?? "rifleman");
        continue;
      }
      // Objectives: head for the nearest flag we don't hold (or defend one we do).
      const phase = (hashId(b.id) % 50) / 10;
      if (Math.floor((w.time - phase) / OBJECTIVE_PERIOD) !== Math.floor((w.time - dt - phase) / OBJECTIVE_PERIOD)) {
        const team = b.team as Team;
        const wanted = this.cq.flags.filter((f) => f.owner !== team);
        const pool = wanted.length ? wanted : this.cq.flags;
        const f = pool.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[this.rng.next() < 0.7 ? 0 : pool.length - 1];
        hintPosition(w, brain, f.x, f.y, 2, this.rng);
      }
      b.spreadMult = SKILLS.normal.spreadMult * STANCE_SPREAD[b.stance ?? 0];
      updateBot(w, b, brain, dt, this.rng);
      // Stance: keep low in a trench, pop up to fire; drop prone to snipe in the open.
      const engaged = w.time - b.firedAt < 1.4;
      const still = b.speed < 0.4;
      const inTrench = this.inTrench(b);
      b.stance = !still ? 0 : inTrench ? (engaged ? 0 : 1) : engaged ? (hashId(b.id) % 3 === 0 ? 2 : 1) : 0;
    }
    stepConquest(
      this.cq,
      living.map((e) => ({ x: e.x, y: e.y, team: e.team as Team, alive: e.alive })),
      dt,
    );
    this.digsAcc += dt;
    if (this.digsAcc >= DIGS_INTERVAL) {
      this.digsAcc = 0;
      const dug = w.map.dug ?? [];
      if (dug.length) this.transport.send({ t: "digs", m: this.m, c: dug });
    }
    this.cqAcc += dt;
    if (this.cqAcc >= CQ_INTERVAL || this.cq.winner !== null) {
      this.cqAcc = 0;
      this.sendCq();
    }
  }

  // ---------------------------------------------------------------- realism

  /** The local soldier: stance, sprint + stamina, digging, then move / aim / fire. */
  private applyInput(input: PlayerInput, dt: number) {
    const w = this.world;
    const me = this.me;
    if (!me.alive) {
      this.digCell = -1;
      return;
    }
    if (input.crouch) me.stance = me.stance === 1 ? 0 : 1;
    if (input.prone) me.stance = me.stance === 2 ? 0 : 2;
    const moving = Math.hypot(input.forward, input.strafe) > 0.1;
    const sprint = !!input.sprint && input.forward > 0.3 && !input.aim && (me.stamina ?? 1) > 0.02;
    if (sprint) me.stance = 0;
    me.stamina = Math.max(0, Math.min(1, (me.stamina ?? 1) + (sprint ? -dt / SPRINT_SECONDS : dt / (moving ? 18 : 7))));

    // Digging (hold): the cell underfoot, or the next one ahead when already in a trench.
    const target = input.dig ? this.digTarget() : -1;
    if (target >= 0) {
      if (target !== this.digCell) {
        this.digCell = target;
        this.digK = 0;
      }
      this.digK += (dt / DIG_SECONDS) * (this.myClass === "engineer" ? ENGINEER_DIG : 1);
      if (this.digK >= 1) {
        this.applyDig(target, true);
        this.digCell = -1;
        this.digK = 0;
      }
    } else {
      this.digCell = -1;
      this.digK = 0;
    }
    const digging = this.digCell >= 0;

    if (input.slot !== null && input.slot >= 0 && input.slot < SLOTS) switchSlot(w, me, input.slot);
    me.angle += input.turn;
    me.aiming = input.aim && !sprint && !digging && !!activeWeapon(me) && !me.using && me.reloadUntil <= w.time;
    // Accuracy: stance, movement, hip fire and a winded soldier all widen the cone.
    const tired = (me.stamina ?? 1) < 0.3 ? 1.35 : 1;
    me.spreadMult = STANCE_SPREAD[me.stance ?? 0] * (moving ? 1.6 : 1) * (me.aiming ? 1 : 1.5) * tired;
    me.damageMult = LETHALITY;
    const speed = STANCE_SPEED[me.stance ?? 0] * (sprint ? SPRINT_MULT : 1) * this.groundSpeed(me);
    if (!digging) move(w, me, input.forward, input.strafe, dt, speed);
    else me.speed = 0;
    if (input.reload) startReload(w, me);
    if (input.fire && !sprint && !digging) fire(w, me, this.rng);
  }

  private groundSpeed(e: Entity) {
    const map = this.world.map;
    const g = map.ground[Math.floor(e.y) * map.width + Math.floor(e.x)];
    if (g === GROUND.duck || g === GROUND.road) return 1.05;
    if (g === GROUND.trench) return 0.9;
    if (this.field.front === "passchendaele" && (g === GROUND.dirt || g === GROUND.grass)) return 0.78;
    if (g === GROUND.snow || g === GROUND.sand) return 0.9;
    return 1;
  }

  inTrench(e: { x: number; y: number }) {
    const map = this.world.map;
    const x = Math.floor(e.x);
    const y = Math.floor(e.y);
    return x >= 0 && y >= 0 && x < map.width && y < map.height && map.ground[y * map.width + x] === GROUND.trench;
  }

  /**
   * Cover model: soldiers in a trench show only head and shoulders (and nothing
   * when crouched or prone); a crouched soldier in a trench can't fire out of it;
   * prone and crouched soldiers in the open are smaller targets at range.
   * Returns true when the round is stopped. `roll` is uniform in [0, 1).
   */
  covered(shooter: Entity, target: Entity, dist: number, roll: number) {
    if (dist < 3.5) return false;
    const tIn = this.inTrench(target);
    const sIn = this.inTrench(shooter);
    if (sIn && (shooter.stance ?? 0) > 0 && !tIn) return true;
    if (tIn && sIn && this.trenchLine(shooter, target)) return false;
    const st = target.stance ?? 0;
    if (tIn) return st > 0 || roll < 0.6;
    if (st === 2 && dist > 8) return roll < 0.5;
    if (st === 1 && dist > 12) return roll < 0.2;
    return false;
  }

  /** Both soldiers are in the same stretch of trench (the whole line between them is trench). */
  private trenchLine(a: Entity, b: Entity) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d * 2);
    for (let i = 1; i < n; i++) if (!this.inTrench({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n })) return false;
    return true;
  }

  private diggable(i: number) {
    const map = this.world.map;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (i < 0 || i >= map.cells.length || x < 2 || y < 2 || x >= map.width - 2 || y >= map.height - 2) return false;
    const g = map.ground[i];
    return map.cells[i] === 0 && g !== GROUND.trench && g !== GROUND.floor && g !== GROUND.duck;
  }

  private digTarget() {
    const me = this.me;
    if ((me.stance ?? 0) === 2 || me.using) return -1;
    const W = this.world.map.width;
    const here = Math.floor(me.y) * W + Math.floor(me.x);
    if (this.diggable(here)) return here;
    const ahead = Math.floor(me.y + Math.sin(me.angle) * 0.95) * W + Math.floor(me.x + Math.cos(me.angle) * 0.95);
    return this.inTrench(me) && this.diggable(ahead) ? ahead : -1;
  }

  /** Turn a cell into trench (local dig → broadcast; remote digs are validated the same way). */
  private applyDig(i: number, local: boolean) {
    const map = this.world.map;
    if ((map.dug?.length ?? 0) >= MAX_DUG || !this.diggable(i)) return false;
    map.ground[i] = GROUND.trench;
    (map.dug ??= []).push(i);
    if (local) this.transport.send({ t: "dig", m: this.m, c: i });
    return true;
  }

  task() {
    return this.digCell >= 0 ? { label: "Digging", k: this.digK } : null;
  }

  // -------------------------------------------------------------------- HUD

  private flash(b: Banner, seconds: number) {
    this.bannerMsg = b;
    this.bannerUntil = this.world.time + seconds;
  }

  status(): ModeStatus {
    const left = Math.max(0, MATCH_SECONDS - this.cq.time);
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    const flags = this.cq.flags
      .map((f) => {
        const [a, b] = f.present;
        const who = f.owner === 0 ? "—" : f.owner === this.myTeam ? "ours" : "theirs";
        return `${f.id} ${a && b ? "⚔" : who}`;
      })
      .join(" · ");
    const stamina = Math.round((this.me.stamina ?? 1) * 100);
    return {
      primary: `${TEAM_SHORT[1]} ${this.cq.tickets[0]} · ${this.cq.tickets[1]} ${TEAM_SHORT[2]}`,
      kills: this.me.kills,
      storm: `${flags} · ${clock}`,
      stormUrgent: this.cq.tickets[this.myTeam - 1] < 30,
      detail: this.me.alive ? `${STANCES[this.me.stance ?? 0]}${this.inTrench(this.me) ? " · IN TRENCH" : ""} · STAMINA ${stamina}%` : "",
    };
  }

  banner(): Banner | null {
    if (this.isOver()) {
      const title = this.resultTitle();
      return { text: title.toUpperCase(), sub: `${TEAM_NAMES[1]} ${this.cq.tickets[0]} – ${this.cq.tickets[1]} ${TEAM_NAMES[2]}`, color: title === "Victory" ? "#ffb321" : "#ff5a4f" };
    }
    if (!this.me.alive)
      return { text: "REDEPLOYING", sub: `Back in the fight in ${Math.max(0, Math.ceil(this.me.respawnAt - this.world.time))}s`, color: "#ff5a4f" };
    const mine = this.cq.flags.find((f) => Math.hypot(f.x - this.me.x, f.y - this.me.y) <= f.r);
    if (mine && this.world.time >= this.bannerUntil) {
      const [a, b] = mine.present;
      if (a && b) return { text: `FLAG ${mine.id} CONTESTED`, color: "#ffb321" };
      if (mine.owner !== this.myTeam) return { text: `CAPTURING ${mine.id}`, sub: `${Math.round(Math.abs(mine.p) * 100)}%`, color: TEAM_COLORS[this.myTeam] };
    }
    return this.world.time < this.bannerUntil ? this.bannerMsg : null;
  }

  scoreboard(showAll: boolean): ScoreRow[] | null {
    if (!showAll && !this.isOver()) return null;
    return [...this.world.entities.values()]
      .sort((a, b) => a.team - b.team || b.kills - a.kills || a.deaths - b.deaths)
      .map((e) => ({ name: `${e.team === 1 ? "◆" : "●"} ${e.name}`, kills: e.kills, deaths: e.deaths, me: e.id === this.me.id }));
  }

  markers(): Marker[] {
    const out: Marker[] = this.cq.flags.map((f) => ({
      id: f.id,
      kind: "flag",
      x: f.x,
      y: f.y,
      r: f.r,
      label: f.id,
      raise: Math.abs(f.p),
      color: f.owner ? TEAM_COLORS[f.owner] : Math.abs(f.p) > 0.05 ? TEAM_COLORS[f.p < 0 ? 1 : 2] + "aa" : NEUTRAL,
    }));
    for (const e of this.world.entities.values())
      if (e.alive && e.id !== this.me.id && e.team === this.me.team) out.push({ id: e.id, kind: "ally", x: e.x, y: e.y, color: TEAM_COLORS[this.myTeam] });
    return out;
  }

  tagColor(id: string) {
    const e = this.world.entities.get(id);
    return e && e.team === this.me.team ? "#9cc2ff" : "#ff9a92";
  }

  isOver() {
    return this.cq.winner !== null;
  }

  won() {
    return this.cq.winner === this.myTeam;
  }

  resultTitle() {
    return this.cq.winner === 0 ? "Draw" : this.won() ? "Victory" : "Defeat";
  }

  afterResults() {
    if (this.opts.solo) return false;
    this.opts.onBackToLobby?.();
    return true;
  }

  score() {
    return this.me.kills * 100 + (this.won() ? 500 : 0);
  }

  stats() {
    return null;
  }

  nameOf(id: string) {
    return this.world.entities.get(id)?.name ?? (id === "storm" ? "The Storm" : "Soldier");
  }

  destroy() {
    this.unsub.forEach((u) => u());
    if (this.opts.solo) this.transport.close();
  }
}

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const RESPAWN_SECONDS = RESPAWN_DELAY;
