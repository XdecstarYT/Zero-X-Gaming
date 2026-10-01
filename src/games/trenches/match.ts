import { createRng, type Rng } from "../engine/rng";
import { applySkill, canSee, createBrain, hintPosition, SKILLS, updateBot, type BotBrain } from "../neon-siege/bots";
import { makeConsumable, makeWeapon, SLOTS, weaponDef } from "../neon-siege/items";
import type { Banner, Marker, ModeController, ModeStatus, ScoreRow, ViewEffects } from "../neon-siege/mode";
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
import { DEFAULT_FRONT, FRONTLINE_FRONT, FRONTS, isFrontId } from "./fronts";
import {
  ATTACKERS,
  attackersEliminated,
  BREAKTHROUGH_SECONDS,
  FRONTLINE_OBJECTIVES,
  FRONTLINE_RESPAWNS,
  FRONTLINE_SECONDS,
  createConquest,
  isLive,
  onDeath,
  SECTORS,
  stepConquest,
  MATCH_SECONDS,
  type ConquestState,
  type GameMode,
  isGameMode,
} from "./conquest";
import {
  blastDamage,
  floorAt,
  GRENADE_BLAST,
  planBarrage,
  powerFor,
  SHELL_BLAST,
  stepGrenade,
  throwGrenade,
  type BlastSpec,
  type Grenade,
} from "./explosives";
import type { TrenchesMatch as BattleStats } from "@/lib/season";
import { DEFAULT_LOADOUTS, isLoadout, type Loadout, type LobbySnapshot, type SupportKind, type TEntState, type TrenchClass, type TrenchMsg } from "./protocol";
import { castRay, lineOfSight, moveWithCollision } from "../neon-siege/map";
import {
  clampTraverse,
  cloudState,
  GAS,
  gasAt,
  gasDamage,
  hasBayonet,
  MELEE,
  meleeTarget,
  MG,
  REVIVE,
  revivable,
  stepHeat,
  WIND,
  type GasCloud,
} from "./warfare";

const SUPPORT_NAMES: Record<SupportKind, string> = { artillery: "Artillery", supply: "Supply drop", recon: "Recon flare", gas: "Gas shells" };

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
/** Great War weapons carry realistic damage already (two rifle hits kill); bots are a little weaker. */
const LETHALITY = 1;
const BOT_LETHALITY = 1.5;
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
/** Grenades per class, restocked on redeploy. */
export const GRENADES: Record<TrenchClass, number> = { rifleman: 3, assault: 3, medic: 1, marksman: 1, engineer: 2 };
const THROW_COOLDOWN = 1.2;
const BOT_THROW_COOLDOWN = 14;
/** Artillery: a barrage every BARRAGE_MIN..MAX seconds. */
const BARRAGE_MIN = 45;
const BARRAGE_MAX = 80;
const BARRAGE_SHELLS = 8;
/** Support calls: cooldown seconds (snipers recharge 40% faster). */
export const SUPPORT_COOLDOWN: Record<SupportKind, number> = { artillery: 150, supply: 100, recon: 60, gas: 180 };
const GAS_SHELLS = 3;
/** One host barrage in three is gas. */
const GAS_BARRAGE_CHANCE = 0.34;
const STRIKE_MIN = 22;
const STRIKE_MAX = 110;
const STRIKE_SHELLS = 6;
const SUPPLY_RADIUS = 3.5;
const SUPPLY_LIFE = 40;
const RECON_RADIUS = 45;
const RECON_SECONDS = 15;

/** Arm a soldier for their class and loadout (restocked on every redeploy). Weapons are Great War pattern. */
export function equipClass(e: Entity, cls: TrenchClass, loadout: Loadout = DEFAULT_LOADOUTS[cls]) {
  e.inventory = Array.from({ length: SLOTS }, () => null);
  let slot = 0;
  e.inventory[slot++] = makeWeapon(loadout.primary, "rare", "ww1");
  if (loadout.secondary === "pistol") e.inventory[slot++] = makeWeapon("pistol", "rare", "ww1");
  const dressings = 1 + (loadout.gadget === "medkits" ? 2 : 0) + (cls === "medic" ? 1 : 0);
  e.inventory[slot++] = makeConsumable("medkit", Math.min(3, dressings));
  if (loadout.gadget === "armour") e.inventory[slot++] = makeConsumable("shield", 1);
  e.active = 0;
  e.stance = 0;
  e.stamina = 1;
  e.digging = false;
  e.grenades = GRENADES[cls] + (loadout.gadget === "grenades" ? 2 : 0);
}

export interface MatchOptions {
  /** Solo vs bots: the run ends after the results screen. */
  solo?: boolean;
  /** Lobby matches: called after the results screen to go back to the lobby. */
  onBackToLobby?: () => void;
  /** Peers already in the room (the lobby knows them before we subscribe). */
  roster?: PeerInfo[];
  myClass?: TrenchClass;
  /** Your loadout (defaults to the class's). */
  myLoadout?: Loadout;
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
  private myLoadout: Loadout;
  /** Support calls: when each is ready again (world time). */
  private supportReady: Record<SupportKind, number> = { artillery: 30, supply: 20, recon: 10, gas: 45 };
  private crates: { id: string; x: number; y: number; team: Team; until: number; used: Set<string> }[] = [];
  private recons: { x: number; y: number; team: Team; until: number }[] = [];
  private artyFrom = new Map<string, number>();
  /** Frontline: redeploys left per soldier (own soldier + host's bots; others from their state). */
  private redeploys = new Map<string, number>();
  private digCell = -1;
  private digK = 0;
  private digsAcc = 0;
  readonly mode: GameMode;
  private grenades: Grenade[] = [];
  private blasts: ViewEffects["blasts"] = [];
  private shells: { x: number; y: number; at: number; warned: boolean; owner: string; gas?: boolean }[] = [];
  // Over the Top: gas, masks, bayonets, emplaced guns and revives.
  private clouds: GasCloud[] = [];
  private wind: { x: number; y: number };
  private gasAcc = new Map<string, number>();
  private gasSeenAt = new Map<string, number>();
  private maskWant = new Map<string, boolean>();
  private gasWarnAt = -10;
  private nextMeleeAt = 0;
  private botMeleeAt = new Map<string, number>();
  /** Which emplaced gun each soldier mans (index into field.mgs). */
  private mgUser = new Map<string, number>();
  private mgSaved = new Map<string, { inventory: Entity["inventory"]; active: number }>();
  private botMgUntil = new Map<string, number>();
  private heat = 0;
  private overheated = false;
  private deadAt = new Map<string, number>();
  private reviving: { target: string; k: number } | null = null;
  private botReviving = new Map<string, { target: string; k: number }>();
  private nadeSeq = 0;
  private nextThrowAt = 0;
  private botThrowAt = new Map<string, number>();
  private nextBarrageAt = 0;
  private lastSector = 0;
  /** This soldier's battle, for the results screen and the war record. */
  private tally = { captures: 0, digs: 0, grenadeKills: 0, streak: 0, bestStreak: 0, bayonetKills: 0, mgKills: 0, revives: 0, gasKills: 0 };
  readonly m: number;

  constructor(
    private transport: Transport<TrenchMsg>,
    private snap: LobbySnapshot,
    private opts: MatchOptions = {},
  ) {
    this.m = snap.matchId;
    this.mode = isGameMode(snap.mode) ? snap.mode : "conquest";
    this.rng = createRng(snap.seed ^ hashId(transport.selfId));
    this.field = battlefield(
      this.mode === "frontline" ? FRONTLINE_FRONT : isFrontId(snap.front) && !FRONTS[snap.front].frontlineOnly ? snap.front : DEFAULT_FRONT,
    );
    this.world = createWorld(this.field.map);
    this.wind = WIND[this.field.front] ?? { x: 0.2, y: 0 };
    this.world.chests = [];
    this.cq = createConquest(this.field.flags, undefined, this.mode);
    this.nextBarrageAt = 30 + (snap.seed % 20);
    this.lastOwners = this.cq.flags.map((f) => f.owner);
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
    this.myLoadout = isLoadout(opts.myLoadout) ? opts.myLoadout : DEFAULT_LOADOUTS[this.myClass];
    if (this.mode === "frontline" && team === ATTACKERS) this.redeploys.set(this.me.id, FRONTLINE_RESPAWNS);
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
    const how =
      this.mode === "breakthrough"
        ? team === ATTACKERS
          ? "Breakthrough: you attack. Take the sectors in order before your tickets run out."
          : "Breakthrough: you defend. Hold the line: every sector they take brings them closer."
        : this.mode === "frontline"
          ? team === ATTACKERS
            ? `Frontline: take the beach, the villages, the line and the HQ in order. You have ${FRONTLINE_RESPAWNS} redeploys.`
            : "Frontline: you defend Cape Helles. Hold any objective until the clock runs out, or wipe out the landing."
          : "Classic: capture and hold the flags. Every death costs a ticket.";
    this.flash({ text: def.name.toUpperCase(), sub: `${def.place} · ${how}`, color: TEAM_COLORS[team] }, 5);
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
    // Spawn at owned flags that aren't under attack (Breakthrough: not in the live sector).
    const flags = this.cq.flags.filter((f, i) => f.owner === team && (this.mode === "conquest" || !isLive(this.cq, i) || team !== ATTACKERS));
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
    this.dismount(e);
    this.maskWant.set(e.id, false);
    this.deadAt.delete(e.id);
    Object.assign(e, { x, y, hp: e.maxHp, shield: 0, alive: true, reloadUntil: 0, reloadSlot: -1, lastAttacker: null, using: null, aiming: false, masked: 0 });
    e.angle = team === 1 ? 0 : Math.PI;
    equipClass(e, cls, e === this.me ? this.myLoadout : undefined);
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
      if (this.mode === "frontline" && team === ATTACKERS) this.redeploys.set(id, FRONTLINE_RESPAWNS);
      this.spawn(b, cls);
      this.adoptBot(b);
    }
  }

  private adoptBot(b: Entity) {
    applySkill(b, SKILLS.normal);
    b.damageMult = SKILLS.normal.damageMult * BOT_LETHALITY;
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
        if (msg.w === "bayonet" && "x" in attacker && Math.hypot(attacker.x - victim.x, attacker.y - victim.y) > MELEE.chargeReach + 2) return;
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
      case "nade": {
        if (this.owns(msg.o) || this.grenades.some((g) => g.id === msg.id) || this.grenades.length > 40) return;
        if (![msg.x, msg.y, msg.a, msg.p].every(Number.isFinite)) return;
        this.grenades.push(throwGrenade(msg.id, msg.o, msg.x, msg.y, msg.a, this.world.time, msg.p));
        break;
      }
      case "arty": {
        if (!Array.isArray(msg.s)) return;
        // The host's barrages, or a player's own call-in (at most one a minute each).
        const caller = msg.o;
        if (caller) {
          if (caller !== from || this.world.time < (this.artyFrom.get(from) ?? -1e9)) return;
          this.artyFrom.set(from, this.world.time + 60);
        } else if (from !== this.hostId) return;
        for (const [x, y, delay] of msg.s.slice(0, caller ? STRIKE_SHELLS : 16))
          if ([x, y, delay].every(Number.isFinite))
            this.shells.push({ x, y, at: this.world.time + Math.max(0, Math.min(20, delay)), warned: false, owner: caller ?? "artillery", gas: msg.g === 1 });
        break;
      }
      case "supply": {
        if (typeof msg.id !== "string" || msg.id.length > 80 || !msg.id.startsWith(`${from}:`)) return;
        if (![msg.x, msg.y].every(Number.isFinite) || (msg.tm !== 1 && msg.tm !== 2) || this.crates.length > 20) return;
        if (this.crates.some((c) => c.id === msg.id)) return;
        this.crates.push({ id: msg.id, x: msg.x, y: msg.y, team: msg.tm, until: this.world.time + SUPPLY_LIFE, used: new Set() });
        break;
      }
      case "recon": {
        if (![msg.x, msg.y, msg.d].every(Number.isFinite) || (msg.tm !== 1 && msg.tm !== 2)) return;
        this.recons.push({ x: msg.x, y: msg.y, team: msg.tm, until: this.world.time + Math.min(RECON_SECONDS, msg.d) });
        break;
      }
      case "revive": {
        if (typeof msg.v !== "string" || typeof msg.by !== "string") return;
        const v = this.world.entities.get(msg.v);
        const by = this.world.entities.get(msg.by);
        if (!v || !by || by.team !== v.team || !by.alive || Math.hypot(by.x - v.x, by.y - v.y) > REVIVE.radius + 1.5) return;
        this.applyRevive(v, by);
        break;
      }
      case "cq":
        if (from !== this.hostId) return;
        if (typeof msg.sc === "number" && msg.sc >= 0 && msg.sc <= 5) this.cq.sector = msg.sc;
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
    else if (typeof es.mg !== "number" && (held?.type !== "weapon" || held.kind !== es.w || held.rarity !== es.r || held.era !== "ww1"))
      e.inventory[0] = makeWeapon(es.w, es.r ?? "common", "ww1");
    if (typeof es.rl === "number") this.redeploys.set(es.id, Math.max(0, Math.min(FRONTLINE_RESPAWNS, es.rl)));
    e.masked = es.gm === 1 ? 1 : 0;
    const gun = typeof es.mg === "number" && this.field.mgs?.[es.mg] ? es.mg : -1;
    if (gun >= 0) {
      this.mgUser.set(es.id, gun);
      e.mounted = true;
      e.inventory[0] = makeWeapon("smg", "rare", "mg");
    } else if (this.mgUser.has(es.id)) {
      this.mgUser.delete(es.id);
      e.mounted = false;
    }
    if (wasAlive && !es.al) this.deadAt.set(es.id, this.world.time);
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
      rl: this.redeploys.get(e.id),
      gm: (e.masked ?? 0) >= 1 ? 1 : undefined,
      mg: this.mgUser.get(e.id),
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
      sc: this.cq.sector,
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
      // Wounded: wait for a medic, or redeploy now (fire).
      if (!this.me.alive && input.fire && w.time - (this.deadAt.get(this.me.id) ?? -10) > 0.8) this.me.respawnAt = Math.min(this.me.respawnAt, w.time);
      if (!this.me.alive && w.time >= this.me.respawnAt && this.useRedeploy(this.me)) this.spawn(this.me, this.myClass);
      this.stepGas(dt);
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

    this.stepExplosives(dt);

    const events = drainEvents(w);
    for (const ev of events) {
      if (ev.type === "kill") {
        this.deadAt.set(ev.victim, w.time);
        const victim = w.entities.get(ev.victim);
        if (victim && this.owns(victim.id)) {
          this.dismount(victim);
          // Wounded, not gone: if a medic is near, wait for them (you can still redeploy).
          if (this.medicNear(victim)) victim.respawnAt = w.time + REVIVE.window;
        }
        if (ev.killer === this.me.id && ev.victim !== this.me.id) {
          this.tally.streak++;
          this.tally.bestStreak = Math.max(this.tally.bestStreak, this.tally.streak);
          if (ev.weapon === "grenade") this.tally.grenadeKills++;
          if (ev.weapon === "bayonet") this.tally.bayonetKills++;
          if (ev.weapon === "gas") this.tally.gasKills++;
          if (this.me.mounted) this.tally.mgKills++;
        }
        if (ev.victim === this.me.id) this.tally.streak = 0;
      }
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
          if (ours && this.me.alive && Math.hypot(this.me.x - f.x, this.me.y - f.y) <= f.r) this.tally.captures++;
          this.flash({ text: `${ours ? "WE TOOK" : "WE LOST"} ${f.id}`, sub: `${TEAM_NAMES[f.owner]} hold flag ${f.id}`, color: TEAM_COLORS[f.owner] }, 2.5);
        }
        this.lastOwners[i] = f.owner;
      }
    });

    if (this.cq.sector !== this.lastSector && this.mode === "frontline") {
      // Each objective taken gives every attacker one redeploy back (up to the maximum).
      for (const [id, left] of this.redeploys)
        if (this.owns(id)) this.redeploys.set(id, Math.min(FRONTLINE_RESPAWNS, left + 1));
    }
    if (this.cq.sector !== this.lastSector && this.mode === "frontline") {
      const f = this.cq.flags[FRONTLINE_OBJECTIVES[this.lastSector]?.[0] ?? 0];
      const next = this.cq.flags[FRONTLINE_OBJECTIVES[this.cq.sector]?.[0] ?? -1];
      const attacking = this.myTeam === ATTACKERS;
      if (this.cq.winner === null && next)
        this.flash(
          attacking
            ? { text: `${(f.name ?? f.id).toUpperCase()} TAKEN`, sub: `+1 redeploy. Next objective: ${next.name ?? next.id}.`, color: TEAM_COLORS[1] }
            : { text: `${(f.name ?? f.id).toUpperCase()} LOST`, sub: `Fall back to ${next.name ?? next.id} and hold it.`, color: TEAM_COLORS[2] },
          3.5,
        );
      this.lastSector = this.cq.sector;
    }
    if (this.cq.sector !== this.lastSector) {
      const taken = SECTORS[this.lastSector]?.map((i) => this.cq.flags[i].id).join(" + ");
      const attacking = this.myTeam === ATTACKERS;
      if (this.cq.winner === null)
        this.flash(
          attacking
            ? { text: `SECTOR ${this.lastSector + 1} TAKEN`, sub: `${taken} are ours. Reinforcements are here: push on!`, color: TEAM_COLORS[1] }
            : { text: `SECTOR ${this.lastSector + 1} LOST`, sub: `Fall back and hold the next line.`, color: TEAM_COLORS[2] },
          3.5,
        );
      this.lastSector = this.cq.sector;
    }

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
        if (w.time >= b.respawnAt && this.useRedeploy(b)) this.spawn(b, this.botClass.get(b.id) ?? "rifleman");
        continue;
      }
      // Objectives: head for the nearest flag we don't hold (or defend one we do).
      const phase = (hashId(b.id) % 50) / 10;
      if (Math.floor((w.time - phase) / OBJECTIVE_PERIOD) !== Math.floor((w.time - dt - phase) / OBJECTIVE_PERIOD)) {
        const team = b.team as Team;
        const live = this.cq.flags.filter((_, i) => isLive(this.cq, i));
        const wanted = live.filter((f) => f.owner !== team);
        const pool = this.mode !== "conquest" ? (wanted.length && team === ATTACKERS ? wanted : live) : wanted.length ? wanted : this.cq.flags;
        const f = pool.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[this.rng.next() < 0.7 ? 0 : pool.length - 1];
        hintPosition(w, brain, f.x, f.y, 2, this.rng);
      }
      b.spreadMult = SKILLS.normal.spreadMult * STANCE_SPREAD[b.stance ?? 0];
      const gun = this.mgUser.get(b.id);
      if (gun === undefined && this.botMedic(b, brain, dt)) continue;
      updateBot(w, b, brain, dt, this.rng);
      this.botGrenade(b);
      this.botMelee(b);
      this.botGun(b, brain);
      this.botMask(b);
      // Stance: keep low in a trench, pop up to fire; drop prone to snipe in the open.
      const engaged = w.time - b.firedAt < 1.4;
      const still = b.speed < 0.4;
      const inTrench = this.inTrench(b);
      b.stance = !still ? 0 : inTrench ? (engaged ? 0 : 1) : engaged ? (hashId(b.id) % 3 === 0 ? 2 : 1) : 0;
      if (b.mounted) b.stance = 0;
    }
    stepConquest(
      this.cq,
      living.map((e) => ({ x: e.x, y: e.y, team: e.team as Team, alive: e.alive })),
      dt,
    );
    this.checkElimination();
    if (w.time >= this.nextBarrageAt) {
      this.nextBarrageAt = w.time + BARRAGE_MIN + this.rng.next() * (BARRAGE_MAX - BARRAGE_MIN);
      this.callBarrage();
    }
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
    const stamina = SPRINT_SECONDS * (this.myClass === "assault" ? 1.5 : 1);
    me.stamina = Math.max(0, Math.min(1, (me.stamina ?? 1) + (sprint ? -dt / stamina : dt / (moving ? 18 : 7))));

    // Digging (hold): the cell underfoot, or the next one ahead when already in a trench.
    const target = input.dig ? this.digTarget() : -1;
    if (target >= 0) {
      if (target !== this.digCell) {
        this.digCell = target;
        this.digK = 0;
      }
      this.digK += (dt / DIG_SECONDS) * (this.myClass === "engineer" ? ENGINEER_DIG : 1) * (this.myLoadout.gadget === "spade" ? 2 : 1);
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
    me.digging = digging;
    if (input.support) this.callSupport(input.support);
    // Gas mask: M toggles; it takes a moment to pull on.
    if (input.mask) this.maskWant.set(me.id, !this.maskWant.get(me.id));
    me.masked = Math.max(0, Math.min(1, (me.masked ?? 0) + (this.maskWant.get(me.id) ? dt : -dt * 2) / GAS.maskSeconds));
    // E: man / leave an emplaced gun, or start first aid on a fallen teammate (medics).
    if (input.interact) {
      if (me.mounted) this.dismount(me);
      else {
        const gun = this.freeGunNear(me);
        if (gun >= 0) this.mount(me, gun);
        else if (this.myClass === "medic") {
          const body = this.woundedNear(me);
          if (body) this.reviving = { target: body.id, k: 0 };
        }
      }
    }
    if (me.mounted && (sprint || input.dig)) this.dismount(me);
    this.stepMyRevive(input, dt);
    if (input.melee && !digging && !me.mounted && w.time >= this.nextMeleeAt) {
      this.nextMeleeAt = w.time + MELEE.cooldown;
      this.meleeFrom(me, sprint);
    }
    // Medics patch themselves up slowly.
    if (this.myClass === "medic" && me.hp < me.maxHp && w.time - me.hurtAt > 4) me.hp = Math.min(me.maxHp, me.hp + dt * 2);

    if (input.slot !== null && input.slot >= 0 && input.slot < SLOTS) switchSlot(w, me, input.slot);
    me.angle += input.turn;
    me.aiming = input.aim && !sprint && !digging && !!activeWeapon(me) && !me.using && me.reloadUntil <= w.time;
    // Accuracy: stance, movement, hip fire and a winded soldier all widen the cone.
    const tired = (me.stamina ?? 1) < 0.3 ? 1.35 : 1;
    me.spreadMult = STANCE_SPREAD[me.stance ?? 0] * (moving ? 1.6 : 1) * (me.aiming ? 1 : 1.5) * tired * ((me.masked ?? 0) > 0.5 ? GAS.maskSpread : 1);
    if (me.mounted) {
      // On the gun: locked to the emplacement, traverse limited, steady as a rock.
      const gun = this.field.mgs![this.mgUser.get(me.id)!];
      me.x = gun.x;
      me.y = gun.y;
      me.angle = clampTraverse(me.angle, gun.a);
      me.stance = 0;
      me.spreadMult = me.aiming ? 0.6 : 1;
      const ammo = activeWeapon(me)?.ammo ?? 0;
      if (input.fire && !this.overheated) fire(w, me, this.rng);
      const shots = Math.max(0, ammo - (activeWeapon(me)?.ammo ?? 0));
      this.heat = stepHeat(this.heat, shots, dt, input.fire && !this.overheated);
      if (this.heat >= 1 && !this.overheated) {
        this.overheated = true;
        this.flash({ text: "GUN OVERHEATED", sub: "Let the water jacket cool…", color: "#ff9a92" }, 2);
      }
      if (this.overheated && this.heat <= MG.resume) this.overheated = false;
      if (input.reload) startReload(w, me);
      me.speed = 0;
      return;
    }
    this.heat = stepHeat(this.heat, 0, dt, false);
    me.damageMult = LETHALITY;
    const speed =
      STANCE_SPEED[me.stance ?? 0] * (sprint ? SPRINT_MULT : 1) * this.groundSpeed(me) * (this.myLoadout.secondary === "none" ? 1.05 : 1);
    if (!digging) move(w, me, input.forward, input.strafe, dt, speed);
    else me.speed = 0;
    if (input.reload) startReload(w, me);
    if (input.fire && !sprint && !digging) fire(w, me, this.rng);
    if (input.throw && !digging && (me.grenades ?? 0) > 0 && w.time >= this.nextThrowAt) this.throwFrom(me, 1);
  }

  // ----------------------------------------------------------- over the top

  /** Gas: clouds drift and thin; every soldier we own breathes what's around them. */
  private stepGas(dt: number) {
    const w = this.world;
    this.clouds = this.clouds.filter((c) => w.time - c.born <= GAS.life);
    if (!this.clouds.length) return;
    for (const e of w.entities.values()) {
      if (!e.alive || !this.owns(e.id)) continue;
      const g = gasAt(this.clouds, w.time, this.wind, e.x, e.y, this.inTrench(e));
      if (g > 0.02) this.gasSeenAt.set(e.id, w.time);
      const dmg = gasDamage(g, e.masked ?? 0, dt);
      if (dmg <= 0) continue;
      const acc = (this.gasAcc.get(e.id) ?? 0) + dmg;
      if (acc >= 3) {
        // Credit the cloud's caller (barrages are nobody's).
        let owner = "gas";
        let best = 0;
        for (const c of this.clouds) {
          const s = cloudState(c, w.time, this.wind);
          if (s && s.k * (1 - Math.min(1, Math.hypot(e.x - s.x, e.y - s.y) / s.r)) > best) {
            best = s.k;
            owner = c.owner === "artillery" ? "gas" : c.owner;
          }
        }
        const by = w.entities.get(owner);
        damage(w, e, by && by.team !== e.team ? by : { id: "gas" }, Math.floor(acc), "gas");
        this.gasAcc.set(e.id, acc - Math.floor(acc));
      } else this.gasAcc.set(e.id, acc);
      if (e === this.me && (e.masked ?? 0) < 1 && w.time - this.gasWarnAt > 4) {
        this.gasWarnAt = w.time;
        this.flash({ text: "GAS! GAS! GAS!", sub: "Mask on: press M", color: "#d9e36b" }, 2.2);
      }
    }
  }

  /** Bots pull their masks on (after a moment) in gas, and off once the air is clear. */
  private botMask(b: Entity) {
    const w = this.world;
    const seen = this.gasSeenAt.get(b.id) ?? -100;
    const g = gasAt(this.clouds, w.time, this.wind, b.x, b.y, this.inTrench(b));
    if (g > 0.02 && !this.maskWant.get(b.id) && this.rng.next() < 0.05) this.maskWant.set(b.id, true);
    else if (g <= 0.02 && w.time - seen > 5) this.maskWant.set(b.id, false);
    b.masked = Math.max(0, Math.min(1, (b.masked ?? 0) + (this.maskWant.get(b.id) ? 1 : -2) / 60 / GAS.maskSeconds));
    b.spreadMult = (b.spreadMult ?? 1) * ((b.masked ?? 0) > 0.5 ? GAS.maskSpread : 1);
  }

  /** A bayonet lunge (or rifle butt) at whoever's in front, in reach. */
  private meleeFrom(e: Entity, charging: boolean) {
    const w = this.world;
    e.meleeAt = w.time;
    // The lunge carries you forward.
    const step = moveWithCollision(w.map, e.x, e.y, Math.cos(e.angle) * MELEE.lunge, Math.sin(e.angle) * MELEE.lunge, 0.3);
    e.x = step.x;
    e.y = step.y;
    const target = meleeTarget(e, w.entities.values(), charging, (x, y, d) => lineOfSight(w.map, e.x, e.y, x, y) || d < 1);
    w.events.push({ type: "melee", id: e.id, hit: !!target, charge: charging });
    if (e === this.me && charging) this.flash({ text: "CHARGE!", color: "#ffb321" }, 0.9);
    if (!target) return;
    const dmg = hasBayonet(activeWeapon(e)?.kind) ? MELEE.bayonet : MELEE.butt;
    if (this.owns(target.id)) damage(w, target, e, dmg, "bayonet");
    else this.transport.send({ t: "hit", m: this.m, a: e.id, v: target.id, d: dmg, w: "bayonet" });
  }

  private botMelee(b: Entity) {
    const w = this.world;
    if (b.mounted || w.time < (this.botMeleeAt.get(b.id) ?? 0) || this.rng.next() > 0.2) return;
    const t = meleeTarget(b, w.entities.values(), false, (x, y) => lineOfSight(w.map, b.x, b.y, x, y));
    if (!t) return;
    this.botMeleeAt.set(b.id, w.time + MELEE.cooldown * 1.6);
    this.meleeFrom(b, false);
  }

  /** The nearest unmanned gun of our own line within reach, or -1. */
  private freeGunNear(e: Entity) {
    const guns = this.field.mgs ?? [];
    const taken = new Set([...this.mgUser.entries()].filter(([id]) => this.world.entities.get(id)?.alive).map(([, i]) => i));
    let best = -1;
    let bd: number = MG.reach;
    guns.forEach((g, i) => {
      if (g.team !== e.team || taken.has(i)) return;
      const d = Math.hypot(g.x - e.x, g.y - e.y);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private mount(e: Entity, gun: number) {
    const g = this.field.mgs![gun];
    this.mgSaved.set(e.id, { inventory: e.inventory.slice(), active: e.active });
    e.inventory = Array.from({ length: SLOTS }, () => null);
    e.inventory[0] = makeWeapon("smg", "rare", "mg");
    e.active = 0;
    e.mounted = true;
    e.stance = 0;
    e.x = g.x;
    e.y = g.y;
    e.angle = g.a;
    this.mgUser.set(e.id, gun);
    if (e === this.me) {
      this.heat = 0;
      this.overheated = false;
      this.flash({ text: "ON THE VICKERS", sub: "Hold fire in bursts: it overheats. E to leave the gun.", color: "#ffb321" }, 2.5);
    }
  }

  private dismount(e: Entity) {
    if (!e.mounted) return;
    const saved = this.mgSaved.get(e.id);
    if (saved) {
      e.inventory = saved.inventory;
      e.active = saved.active;
    }
    this.mgSaved.delete(e.id);
    this.mgUser.delete(e.id);
    e.mounted = false;
    e.reloadUntil = 0;
  }

  /** Host: defenders man their line's guns now and then, for a while. */
  private botGun(b: Entity, brain: BotBrain) {
    const w = this.world;
    const gun = this.mgUser.get(b.id);
    if (gun !== undefined) {
      const g = this.field.mgs![gun];
      b.x = g.x;
      b.y = g.y;
      b.angle = clampTraverse(b.angle, g.a);
      b.speed = 0;
      if (w.time >= (this.botMgUntil.get(b.id) ?? 0)) this.dismount(b);
      return;
    }
    const free = this.freeGunNear(b);
    if (free >= 0 && this.rng.next() < 0.02) {
      this.mount(b, free);
      this.botMgUntil.set(b.id, w.time + 25 + this.rng.next() * 35);
      return;
    }
    // Sometimes head for one.
    if (this.rng.next() < 0.0015 && (this.mode !== "frontline" || b.team !== ATTACKERS)) {
      const guns = (this.field.mgs ?? []).filter((g) => g.team === b.team);
      const g = guns.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      if (g && Math.hypot(g.x - b.x, g.y - b.y) < 30) hintPosition(w, brain, g.x, g.y, 0.5, this.rng);
    }
  }

  /** Is a medic of the soldier's side alive and close enough to be worth waiting for? */
  private medicNear(e: Entity) {
    for (const o of this.world.entities.values()) {
      if (!o.alive || o.team !== e.team || o.id === e.id) continue;
      if (this.classOf(o.id) === "medic" && Math.hypot(o.x - e.x, o.y - e.y) <= REVIVE.medicNear) return true;
    }
    return false;
  }

  private classOf(id: string): TrenchClass | undefined {
    if (id === this.me.id) return this.myClass;
    return this.botClass.get(id) ?? this.snap.players.find((p) => p.id === id)?.cls;
  }

  /** The nearest teammate down and still revivable within reach. */
  private woundedNear(e: Entity, reach: number = REVIVE.radius) {
    let best: Entity | null = null;
    let bd = reach;
    for (const o of this.world.entities.values()) {
      if (o.team !== e.team || o.id === e.id || !revivable(o.alive, this.deadAt.get(o.id), this.world.time)) continue;
      if (this.world.time >= o.respawnAt && this.owns(o.id)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** My first aid: stay with them for a moment. */
  private stepMyRevive(input: PlayerInput, dt: number) {
    const r = this.reviving;
    if (!r) return;
    const t = this.world.entities.get(r.target);
    const moving = Math.hypot(input.forward, input.strafe) > 0.2;
    if (!t || moving || input.fire || !revivable(t.alive, this.deadAt.get(t.id), this.world.time) || Math.hypot(t.x - this.me.x, t.y - this.me.y) > REVIVE.radius + 0.3) {
      this.reviving = null;
      return;
    }
    r.k += dt / REVIVE.hold;
    if (r.k >= 1) {
      this.reviving = null;
      this.doRevive(t, this.me);
    }
  }

  /** Host: bot medics go to fallen teammates and patch them up. Returns true while busy. */
  private botMedic(b: Entity, brain: BotBrain, dt: number) {
    if (this.botClass.get(b.id) !== "medic") return false;
    const job = this.botReviving.get(b.id);
    const w = this.world;
    if (job) {
      const t = w.entities.get(job.target);
      if (!t || !revivable(t.alive, this.deadAt.get(t.id), w.time) || Math.hypot(t.x - b.x, t.y - b.y) > REVIVE.radius + 0.3) {
        this.botReviving.delete(b.id);
        return false;
      }
      b.stance = 1;
      b.speed = 0;
      job.k += dt / REVIVE.hold;
      if (job.k >= 1) {
        this.botReviving.delete(b.id);
        this.doRevive(t, b);
      }
      return true;
    }
    const near = this.woundedNear(b, REVIVE.radius);
    if (near) {
      this.botReviving.set(b.id, { target: near.id, k: 0 });
      return true;
    }
    if (this.rng.next() < 0.05) {
      const far = this.woundedNear(b, 22);
      if (far) hintPosition(w, brain, far.x, far.y, 0.3, this.rng);
    }
    return false;
  }

  /** Bring a fallen soldier back (ours to apply, everyone hears about it). */
  private doRevive(target: Entity, by: Entity) {
    this.transport.send({ t: "revive", m: this.m, v: target.id, by: by.id });
    this.applyRevive(target, by);
    if (by === this.me) {
      this.tally.revives++;
      this.flash({ text: `REVIVED ${target.name.toUpperCase()}`, sub: "Back in the fight.", color: "#7dffb0" }, 2);
    }
  }

  private applyRevive(target: Entity, by: Entity) {
    const w = this.world;
    if (target.alive || !revivable(false, this.deadAt.get(target.id), w.time)) return;
    if (this.owns(target.id)) {
      Object.assign(target, { alive: true, hp: Math.round(target.maxHp * REVIVE.hp), reloadUntil: 0, using: null, aiming: false, lastAttacker: null });
      target.respawnAt = Infinity;
      if (target === this.me) this.flash({ text: "REVIVED", sub: `${by.name} patched you up.`, color: "#7dffb0" }, 2.5);
    }
    this.deadAt.delete(target.id);
    w.events.push({ type: "revive", id: target.id, by: by.id });
    // The ticket that death cost comes back.
    if (this.isHost) {
      const team = target.team as Team;
      this.cq.tickets[team - 1] = (this.cq.tickets[team - 1] ?? 0) + 1;
      this.sendCq();
    }
  }

  prompt() {
    const me = this.me;
    if (!me.alive || this.isOver()) return null;
    if (me.mounted) return "Leave the Vickers gun";
    if (this.freeGunNear(me) >= 0) return "Man the Vickers gun";
    if (this.myClass === "medic") {
      const body = this.woundedNear(me);
      if (body) return `Revive ${body.name}`;
    }
    return null;
  }

  screen() {
    const me = this.me;
    return {
      mask: me.masked ?? 0,
      gas: this.clouds.length ? gasAt(this.clouds, this.world.time, this.wind, me.x, me.y, this.inTrench(me)) : 0,
      heat: me.mounted ? this.heat : undefined,
    };
  }

  // ------------------------------------------------------------ explosives

  /** Throw a grenade from a soldier we own and tell everyone. */
  private throwFrom(e: Entity, power: number) {
    e.grenades = (e.grenades ?? 0) - 1;
    if (e === this.me) this.nextThrowAt = this.world.time + THROW_COOLDOWN;
    const id = `${e.id}:${++this.nadeSeq}`;
    e.thrownAt = this.world.time;
    const g = throwGrenade(id, e.id, e.x, e.y, e.angle, this.world.time, power);
    this.grenades.push(g);
    const r = (v: number) => Math.round(v * 100) / 100;
    this.transport.send({ t: "nade", m: this.m, id, o: e.id, x: r(e.x), y: r(e.y), a: r(e.angle), p: r(power) });
  }

  /** Bots lob a grenade at an enemy they can see at grenade range, now and then. */
  private botGrenade(b: Entity) {
    const w = this.world;
    if (!b.alive || (b.grenades ?? 0) <= 0 || w.time < (this.botThrowAt.get(b.id) ?? 0)) return;
    if (this.rng.next() > 0.02) return;
    for (const t of w.entities.values()) {
      if (!t.alive || t.team === b.team) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d < 9 || d > 24 || !canSee(w, b, t, 26)) continue;
      b.angle = Math.atan2(t.y - b.y, t.x - b.x) + (this.rng.next() - 0.5) * 0.12;
      this.botThrowAt.set(b.id, w.time + BOT_THROW_COOLDOWN);
      this.throwFrom(b, powerFor(d * (0.9 + this.rng.next() * 0.2)));
      return;
    }
  }

  /** Host: shells walk around a contested flag (or no-man's-land). */
  private callBarrage() {
    const live = this.cq.flags.filter((_, i) => isLive(this.cq, i));
    const f = this.rng.pick(live.length ? live : this.cq.flags);
    const cx = f.x + (this.rng.next() - 0.5) * 16;
    const cy = f.y + (this.rng.next() - 0.5) * 16;
    const gas = this.rng.next() < GAS_BARRAGE_CHANCE;
    const plan = planBarrage(cx, cy, gas ? 4 : BARRAGE_SHELLS, () => this.rng.next(), gas ? 9 : undefined);
    const r = (v: number) => Math.round(v * 100) / 100;
    const s = plan.map((p) => [r(p.x), r(p.y), r(p.delay)] as [number, number, number]);
    this.transport.send(gas ? { t: "arty", m: this.m, s, g: 1 } : { t: "arty", m: this.m, s });
    for (const [x, y, delay] of s) this.shells.push({ x, y, at: this.world.time + delay, warned: false, owner: "artillery", gas });
  }

  private stepExplosives(dt: number) {
    const w = this.world;
    for (const g of this.grenades) stepGrenade(g, w.map, dt);
    const due = this.grenades.filter((g) => w.time >= g.fuseAt);
    this.grenades = this.grenades.filter((g) => w.time < g.fuseAt);
    for (const g of due) this.explode({ x: g.x, y: g.y, ...GRENADE_BLAST }, g.z, g.owner, "grenade", false);
    for (const sh of this.shells) {
      if (!sh.warned && w.time >= sh.at - 1.1) {
        sh.warned = true;
        w.events.push({ type: "incoming", x: sh.x, y: sh.y });
        if (Math.hypot(this.me.x - sh.x, this.me.y - sh.y) < 22 && this.world.time >= this.bannerUntil)
          this.flash(
            sh.gas
              ? { text: "GAS SHELLS INCOMING", sub: "Masks ready (M). Gas sinks into trenches: get up out of it!", color: "#d9e36b" }
              : { text: "INCOMING ARTILLERY", sub: "Get into a trench or go prone!", color: "#ffb321" },
            2.5,
          );
      }
    }
    const landed = this.shells.filter((sh) => w.time >= sh.at);
    this.shells = this.shells.filter((sh) => w.time < sh.at);
    for (const sh of landed) {
      if (sh.gas) {
        // A dull pop and a spreading cloud.
        this.clouds.push({ id: `${sh.owner}:${sh.at.toFixed(2)}:${sh.x.toFixed(1)}`, x: sh.x, y: sh.y, born: w.time, owner: sh.owner });
        w.events.push({ type: "gas", x: sh.x, y: sh.y });
        if (this.clouds.length > 24) this.clouds.shift();
      } else this.explode({ x: sh.x, y: sh.y, ...SHELL_BLAST }, floorAt(w.map, sh.x, sh.y), sh.owner, "artillery", true);
    }
    this.blasts = this.blasts.filter((b) => w.time - b.at < 3);
    this.crates = this.crates.filter((c) => w.time < c.until);
    this.recons = this.recons.filter((r) => w.time < r.until);
    // Supply crates restock the soldiers we own that walk up to them (once per crate each).
    for (const c of this.crates)
      for (const e of w.entities.values()) {
        if (!e.alive || e.team !== c.team || c.used.has(e.id) || !this.owns(e.id)) continue;
        if (Math.hypot(e.x - c.x, e.y - c.y) > SUPPLY_RADIUS) continue;
        c.used.add(e.id);
        this.resupply(e);
      }
  }

  /** Full ammo, grenades back to the class allowance, one more dressing. */
  private resupply(e: Entity) {
    for (const it of e.inventory) {
      if (it?.type === "weapon") it.ammo = weaponDef(it).mag;
      if (it?.type === "consumable" && it.kind === "medkit") it.count = Math.min(3, it.count + 1);
    }
    const cls = e === this.me ? this.myClass : (this.botClass.get(e.id) ?? "rifleman");
    const gadget = e === this.me ? this.myLoadout.gadget : DEFAULT_LOADOUTS[cls].gadget;
    e.grenades = Math.max(e.grenades ?? 0, GRENADES[cls] + (gadget === "grenades" ? 2 : 0));
    if (e === this.me) this.flash({ text: "RESUPPLIED", sub: "Ammunition, grenades and a field dressing.", color: "#7dffb0" }, 1.8);
  }

  // ------------------------------------------------------------- support

  /** Call in artillery on where you're looking, a supply drop at your feet, or a recon flare. */
  private callSupport(kind: SupportKind) {
    const w = this.world;
    const me = this.me;
    if (!me.alive || this.isOver()) return;
    const ready = this.supportReady[kind];
    if (w.time < ready) {
      this.flash({ text: `${SUPPORT_NAMES[kind].toUpperCase()} NOT READY`, sub: `Ready in ${Math.ceil(ready - w.time)}s`, color: "#ff9a92" }, 1.4);
      return;
    }
    const r = (v: number) => Math.round(v * 100) / 100;
    const team = this.myTeam;
    if (kind === "artillery" || kind === "gas") {
      const gas = kind === "gas";
      const hit = castRay(w.map, me.x, me.y, me.angle, STRIKE_MAX + 20);
      const d = Math.min(STRIKE_MAX, hit.dist - 1);
      if (d < STRIKE_MIN) {
        this.flash({ text: "TOO CLOSE", sub: `Aim at a point at least ${STRIKE_MIN} m away.`, color: "#ff9a92" }, 1.6);
        return;
      }
      const x = me.x + Math.cos(me.angle) * d;
      const y = me.y + Math.sin(me.angle) * d;
      const plan = planBarrage(x, y, gas ? GAS_SHELLS : STRIKE_SHELLS, () => this.rng.next(), gas ? 8 : 7).map((p) => ({ ...p, delay: p.delay + 2 }));
      const shells = plan.map((p) => [r(p.x), r(p.y), r(p.delay)] as [number, number, number]);
      this.transport.send(gas ? { t: "arty", m: this.m, s: shells, o: me.id, g: 1 } : { t: "arty", m: this.m, s: shells, o: me.id });
      for (const [sx, sy, delay] of shells) this.shells.push({ x: sx, y: sy, at: w.time + delay, warned: false, owner: me.id, gas });
      this.flash(
        gas
          ? { text: "GAS SHELLS", sub: `On the way: ${Math.round(d)} m out. Watch the wind!`, color: "#d9e36b" }
          : { text: "FIRE MISSION", sub: `Shells on the way: ${Math.round(d)} m out. Keep clear!`, color: "#ffb321" },
        2.5,
      );
    } else if (kind === "supply") {
      const id = `${me.id}:crate:${Math.round(w.time * 10)}`;
      const c = { id, x: r(me.x), y: r(me.y), team, until: w.time + SUPPLY_LIFE, used: new Set<string>() };
      this.crates.push(c);
      this.transport.send({ t: "supply", m: this.m, id, x: c.x, y: c.y, tm: team });
      this.flash({ text: "SUPPLY DROP", sub: "Crate down: your squad can restock from it.", color: "#7dffb0" }, 2);
    } else {
      this.recons.push({ x: me.x, y: me.y, team, until: w.time + RECON_SECONDS });
      this.transport.send({ t: "recon", m: this.m, x: r(me.x), y: r(me.y), tm: team, d: RECON_SECONDS });
      this.flash({ text: "RECON FLARE", sub: `Enemies within ${RECON_RADIUS} m are marked on the map.`, color: "#9cc2ff" }, 2);
    }
    this.supportReady[kind] = w.time + SUPPORT_COOLDOWN[kind] * (this.myClass === "marksman" ? 0.6 : 1);
  }

  /** "B ARTY 1:12 · N SUPPLY ✓ · T RECON ✓" */
  private supportLine() {
    const t = this.world.time;
    const keys: Record<SupportKind, string> = { artillery: "B", supply: "N", recon: "T", gas: "H" };
    return (Object.keys(keys) as SupportKind[])
      .map((k) => {
        const left = Math.ceil(this.supportReady[k] - t);
        return `${keys[k]} ${SUPPORT_NAMES[k].toUpperCase()} ${left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "✓"}`;
      })
      .join(" · ");
  }

  // ------------------------------------------------------------ frontline

  /** Frontline attackers spend a redeploy to come back; everyone else always can. */
  private useRedeploy(e: Entity) {
    if (this.mode !== "frontline" || e.team !== ATTACKERS) return true;
    const left = this.redeploys.get(e.id) ?? FRONTLINE_RESPAWNS;
    if (left <= 0) return false;
    this.redeploys.set(e.id, left - 1);
    return true;
  }

  /** Redeploys the local player has left (Frontline attackers), else null. */
  redeploysLeft() {
    return this.mode === "frontline" && this.myTeam === ATTACKERS ? (this.redeploys.get(this.me.id) ?? FRONTLINE_RESPAWNS) : null;
  }

  /** Host: are all attackers dead with no redeploys left? */
  private checkElimination() {
    if (this.mode !== "frontline" || this.cq.winner !== null) return;
    const attackers = [...this.world.entities.values()].filter((e) => e.team === ATTACKERS);
    if (!attackers.length) return;
    const out = attackers.every((e) => !e.alive && (this.redeploys.get(e.id) ?? FRONTLINE_RESPAWNS) <= 0);
    if (out) {
      attackersEliminated(this.cq);
      this.sendCq();
    }
  }

  /** Every client hurts only the soldiers it owns; kills flow through the usual kill messages. */
  private explode(b: BlastSpec, z: number, owner: string, weapon: "grenade" | "artillery", big: boolean) {
    const w = this.world;
    if (this.cq.winner !== null) return;
    w.events.push({ type: "blast", x: b.x, y: b.y, big });
    this.blasts.push({ id: `${owner}:${w.time.toFixed(3)}:${b.x.toFixed(1)}`, x: b.x, y: b.y, at: w.time, big });
    const attacker = w.entities.get(owner) ?? { id: owner };
    for (const e of w.entities.values()) {
      if (!e.alive || !this.owns(e.id)) continue;
      // Friendly fire is off for grenades too (but artillery hits everyone).
      if (weapon === "grenade" && "team" in attacker && attacker.team === e.team && e.id !== owner) continue;
      const dmg = blastDamage(b, w.map, e, z);
      if (dmg > 0) damage(w, e, attacker, dmg, weapon);
    }
  }

  effects(): ViewEffects {
    return {
      projectiles: this.grenades.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z })),
      blasts: this.blasts,
      clouds: this.clouds.flatMap((c) => {
        const s = cloudState(c, this.world.time, this.wind);
        return s ? [{ id: c.id, ...s }] : [];
      }),
    };
  }

  /** The battle so far, for the results screen, season XP and the war record. */
  battleStats(): BattleStats {
    return {
      kills: this.me.kills,
      deaths: this.me.deaths,
      captures: this.tally.captures,
      won: this.won(),
      durationS: Math.round(this.cq.time),
      damage: Math.round(this.me.damageDealt),
      digs: this.tally.digs,
      grenadeKills: this.tally.grenadeKills,
      bestStreak: this.tally.bestStreak,
      front: this.field.front,
      mode: this.mode,
      players: this.world.entities.size,
      bayonetKills: this.tally.bayonetKills,
      mgKills: this.tally.mgKills,
      revives: this.tally.revives,
      gasKills: this.tally.gasKills,
    };
  }

  resultLines(): [string, string][] {
    const b = this.battleStats();
    const t = `${Math.floor(b.durationS / 60)}:${String(b.durationS % 60).padStart(2, "0")}`;
    return [
      ["Kills", String(b.kills)],
      ["Deaths", String(b.deaths)],
      ["Flags taken", String(b.captures)],
      ["Best streak", String(b.bestStreak)],
      ["Grenade kills", String(b.grenadeKills)],
      ["Trench dug", `${b.digs} m`],
      ["Bayonet kills", String(b.bayonetKills ?? 0)],
      ["Vickers kills", String(b.mgKills ?? 0)],
      ["Revives", String(b.revives ?? 0)],
      ["Damage", String(b.damage)],
      ["Battle time", t],
    ];
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
    if (local) {
      this.transport.send({ t: "dig", m: this.m, c: i });
      this.tally.digs++;
    }
    return true;
  }

  task() {
    if (this.reviving) return { label: "First aid", k: this.reviving.k };
    if (this.me.mounted) return { label: this.overheated ? "Overheated" : "Gun heat", k: this.heat };
    return this.digCell >= 0 ? { label: "Digging", k: this.digK } : null;
  }

  // -------------------------------------------------------------------- HUD

  private flash(b: Banner, seconds: number) {
    this.bannerMsg = b;
    this.bannerUntil = this.world.time + seconds;
  }

  status(): ModeStatus {
    const fl = this.mode === "frontline";
    const left = Math.max(0, (this.mode === "breakthrough" ? BREAKTHROUGH_SECONDS : fl ? FRONTLINE_SECONDS : MATCH_SECONDS) - this.cq.time);
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    const flags = this.cq.flags
      .filter((_, i) => isLive(this.cq, i))
      .map((f) => {
        const [a, b] = f.present;
        const who = f.owner === 0 ? "—" : f.owner === this.myTeam ? "ours" : "theirs";
        return `${fl ? (f.name ?? f.id) : f.id} ${a && b ? "⚔" : who}`;
      })
      .join(" · ");
    const stamina = Math.round((this.me.stamina ?? 1) * 100);
    const bt = this.mode === "breakthrough";
    const sector = `SECTOR ${Math.min(SECTORS.length, this.cq.sector + 1)}/${SECTORS.length}`;
    const obj = Math.min(FRONTLINE_OBJECTIVES.length, this.cq.sector + 1);
    const objFlag = this.cq.flags[FRONTLINE_OBJECTIVES[obj - 1][0]];
    const rl = this.redeploysLeft();
    return {
      primary: fl
        ? `${this.myTeam === ATTACKERS ? "ATTACK" : "DEFEND"} · OBJECTIVE ${obj}/${FRONTLINE_OBJECTIVES.length}: ${(objFlag?.name ?? objFlag?.id ?? "").toUpperCase()}${rl !== null ? ` · REDEPLOYS ${rl}` : ""}`
        : bt
        ? `${this.myTeam === ATTACKERS ? "ATTACK" : "DEFEND"} · ${sector} · ${this.cq.tickets[0]} TICKETS`
        : `${TEAM_SHORT[1]} ${this.cq.tickets[0]} · ${this.cq.tickets[1]} ${TEAM_SHORT[2]}`,
      kills: this.me.kills,
      storm: `${flags} · ${clock}`,
      stormUrgent: fl ? left < 120 || (rl !== null && rl === 0) : bt ? this.cq.tickets[0] < 30 : this.cq.tickets[this.myTeam - 1] < 30,
      detail: this.me.alive
        ? `${this.me.mounted ? "ON THE VICKERS" : STANCES[this.me.stance ?? 0]}${this.inTrench(this.me) ? " · IN TRENCH" : ""}${(this.me.masked ?? 0) >= 1 ? " · MASK ON" : ""} · STAMINA ${stamina}% · GRENADES ${this.me.grenades ?? 0}\n${this.supportLine()}`
        : "",
    };
  }

  banner(): Banner | null {
    if (this.isOver()) {
      const title = this.resultTitle();
      const sub =
        this.mode === "frontline"
          ? this.cq.winner === ATTACKERS
            ? `${TEAM_NAMES[1]} took every objective, all the way to the HQ`
            : this.cq.attackersOut
              ? `The landing was wiped out at ${this.objectiveName()}`
              : `${TEAM_NAMES[2]} held ${this.objectiveName()} until the clock ran out`
          : this.mode === "breakthrough"
          ? this.cq.winner === ATTACKERS
            ? `${TEAM_NAMES[1]} broke through all ${SECTORS.length} sectors`
            : `${TEAM_NAMES[2]} held the line at sector ${Math.min(SECTORS.length, this.cq.sector + 1)}`
          : `${TEAM_NAMES[1]} ${this.cq.tickets[0]} – ${this.cq.tickets[1]} ${TEAM_NAMES[2]}`;
      return { text: title.toUpperCase(), sub, color: title === "Victory" ? "#ffb321" : "#ff5a4f" };
    }
    if (!this.me.alive && this.redeploysLeft() === 0 && this.world.time >= this.me.respawnAt)
      return { text: "OUT OF REDEPLOYS", sub: "Spectating: your squad fights on without you.", color: "#ff5a4f" };
    if (!this.me.alive && this.me.respawnAt - this.world.time > 3.2 && revivable(false, this.deadAt.get(this.me.id), this.world.time))
      return { text: "WOUNDED", sub: `A medic is near: hold on (${Math.max(0, Math.ceil(this.me.respawnAt - this.world.time))}s) · fire to redeploy now`, color: "#ff9a92" };
    if (!this.me.alive)
      return { text: this.redeploysLeft() === 0 ? "KILLED IN ACTION" : "REDEPLOYING", sub: `Back in the fight in ${Math.max(0, Math.ceil(this.me.respawnAt - this.world.time))}s`, color: "#ff5a4f" };
    const mine = this.cq.flags.find((f) => Math.hypot(f.x - this.me.x, f.y - this.me.y) <= f.r);
    if (mine && this.world.time >= this.bannerUntil) {
      const [a, b] = mine.present;
      const label = (mine.name ?? `flag ${mine.id}`).toUpperCase();
      if (a && b) return { text: `${label} CONTESTED`, color: "#ffb321" };
      if (mine.owner !== this.myTeam) return { text: `CAPTURING ${mine.name?.toUpperCase() ?? mine.id}`, sub: `${Math.round(Math.abs(mine.p) * 100)}%`, color: TEAM_COLORS[this.myTeam] };
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
    const flares = this.recons.filter((r) => r.team === this.myTeam);
    for (const e of this.world.entities.values()) {
      if (!e.alive || e.id === this.me.id) continue;
      if (e.team === this.me.team) out.push({ id: e.id, kind: "ally", x: e.x, y: e.y, color: TEAM_COLORS[this.myTeam] });
      else if (flares.some((r) => Math.hypot(e.x - r.x, e.y - r.y) <= RECON_RADIUS)) out.push({ id: e.id, kind: "enemy", x: e.x, y: e.y, color: "#ff3b30" });
    }
    for (const c of this.crates) out.push({ id: c.id, kind: "crate", x: c.x, y: c.y, color: c.team === this.myTeam ? "#7dffb0" : "#9a9a9a" });
    const manned = new Set([...this.mgUser.entries()].filter(([id]) => this.world.entities.get(id)?.alive).map(([, i]) => i));
    (this.field.mgs ?? []).forEach((g, i) =>
      out.push({ id: `mg${i}`, kind: "mg", x: g.x, y: g.y, a: g.a, color: TEAM_COLORS[g.team], label: manned.has(i) ? "manned" : undefined }),
    );
    for (const e of this.world.entities.values())
      if (e.team === this.myTeam && e.id !== this.me.id && revivable(e.alive, this.deadAt.get(e.id), this.world.time))
        out.push({ id: `w-${e.id}`, kind: "wounded", x: e.x, y: e.y, color: "#ff3b30" });
    return out;
  }

  /** The objective being fought over (Frontline). */
  private objectiveName() {
    const f = this.cq.flags[FRONTLINE_OBJECTIVES[Math.min(FRONTLINE_OBJECTIVES.length - 1, this.cq.sector)][0]];
    return f?.name ?? f?.id ?? "";
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
    return this.world.entities.get(id)?.name ?? (id === "storm" ? "The Storm" : id === "gas" ? "Poison gas" : "Soldier");
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
