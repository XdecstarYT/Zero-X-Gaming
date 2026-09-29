import { createRng, type Rng } from "../engine/rng";
import { createBrain, hintPosition, SKILLS, updateBot, type BotBrain } from "./bots";
import type { ModeController } from "./mode";
import { electHost, type EntState, type NetMessage, type PeerInfo, type Transport } from "./net";
import type { HudState } from "./render";
import type { PlayerInput } from "./solo";
import {
  createEntity,
  createWorld,
  damage,
  drainEvents,
  fire,
  move,
  respawn,
  startReload,
  tickWorld,
  type Entity,
  type World,
  type WorldEvent,
} from "./world";

/**
 * Online free-for-all deathmatch.
 *
 * Ownership model (no dedicated server):
 *  - Every client owns its own fighter: it moves it, decides its own hits and
 *    applies damage it receives. Hits on someone else are sent to their owner.
 *  - The oldest peer is the host and owns the bots that fill empty slots, runs
 *    their AI, and keeps the match clock. If the host leaves, the next-oldest
 *    peer adopts the bots from its latest snapshot and carries on.
 *  - Other entities are interpolated from 15 Hz state snapshots.
 * Scores can't be verified server-side this way, so online matches are unranked.
 */

export const MATCH_SECONDS = 300;
export const KILL_LIMIT = 15;
/** Humans + bots. Bots fill whatever humans don't. */
export const ROOM_SIZE = 4;
const SEND_INTERVAL = 1 / 15;
const MATCH_BEAT = 1;
const BOT_NAMES = ["Vex", "Nyx", "Kilo", "Rook", "Axon", "Echo", "Onyx", "Flux"];
const BOT_PULSE_S = 6;

export class OnlineController implements ModeController {
  readonly ranked = false;
  readonly showNames = true;
  readonly world: World;
  readonly me: Entity;
  private rng: Rng;
  private peers: PeerInfo[] = [];
  private hostId: string | null = null;
  private brains = new Map<string, BotBrain>();
  private targets = new Map<string, { x: number; y: number; a: number }>();
  private teams = new Map<string, number>();
  private sendAcc = 0;
  private beatAcc = 0;
  private botSeq = 0;
  private matchLeft = MATCH_SECONDS;
  private over = false;
  private unsubscribe: (() => void)[] = [];
  private startedAt = 0;

  constructor(
    private transport: Transport,
    name: string,
    readonly room: string,
    seed = Date.now(),
  ) {
    this.rng = createRng(seed);
    this.world = createWorld();
    this.me = createEntity({
      id: transport.selfId,
      name,
      kind: "human",
      team: this.teamOf(transport.selfId),
      x: 0,
      y: 0,
    });
    this.world.entities.set(this.me.id, this.me);
    respawn(this.world, this.me, this.rng);
    this.world.events = [];
    this.world.onHit = (shooter, target, amount) => {
      if (this.owns(target.id)) return false; // apply locally
      this.transport.send({ t: "hit", a: shooter.id, v: target.id, d: amount });
      return true;
    };
    this.unsubscribe.push(
      transport.onPeers((p) => this.handlePeers(p)),
      transport.onMessage((m, from) => this.handleMessage(m, from)),
    );
  }

  /** Create, connect and return a controller (throws if the room can't be reached). */
  static async join(transport: Transport, name: string, room: string, seed?: number) {
    const c = new OnlineController(transport, name, room, seed);
    await transport.connect();
    c.sendState();
    return c;
  }

  get isHost() {
    return this.hostId === this.me.id;
  }

  private teamOf(id: string) {
    let t = this.teams.get(id);
    if (t === undefined) {
      t = this.teams.size + 1;
      this.teams.set(id, t);
    }
    return t;
  }

  private owns(id: string) {
    const e = this.world.entities.get(id);
    return id === this.me.id || (this.isHost && e?.kind === "bot");
  }

  private bots() {
    return [...this.world.entities.values()].filter((e) => e.kind === "bot");
  }

  // --------------------------------------------------------------- roster

  private handlePeers(peers: PeerInfo[]) {
    this.peers = peers;
    const ids = new Set(peers.map((p) => p.id));
    for (const e of [...this.world.entities.values()]) {
      if (e.kind === "human" && e.id !== this.me.id && !ids.has(e.id)) {
        this.world.entities.delete(e.id);
        this.targets.delete(e.id);
      }
    }
    const newHost = electHost(peers);
    if (newHost !== this.hostId) {
      this.hostId = newHost;
      if (this.isHost) {
        // Adopt existing bots from the last snapshot and take over their AI.
        for (const b of this.bots()) this.adoptBot(b);
      } else {
        this.brains.clear();
      }
    }
    if (this.isHost) this.rebalanceBots();
  }

  private adoptBot(b: Entity) {
    b.weapon = SKILLS.normal.weapon;
    this.targets.delete(b.id);
    if (!this.brains.has(b.id)) this.brains.set(b.id, createBrain(SKILLS.normal, this.rng));
  }

  private rebalanceBots() {
    const want = Math.max(0, ROOM_SIZE - Math.max(1, this.peers.length));
    const bots = this.bots();
    for (let i = bots.length; i < want; i++) {
      const id = `bot-${this.me.id}-${++this.botSeq}`;
      const name = `${BOT_NAMES[(this.botSeq - 1) % BOT_NAMES.length]} [BOT]`;
      const b = createEntity({ id, name, kind: "bot", team: this.teamOf(id), x: 0, y: 0 });
      this.world.entities.set(id, b);
      respawn(this.world, b, this.rng);
      this.adoptBot(b);
    }
    for (const b of bots.slice(want)) {
      this.world.entities.delete(b.id);
      this.brains.delete(b.id);
    }
    this.world.events = this.world.events.filter((e) => e.type !== "respawn");
  }

  // ------------------------------------------------------------- messages

  private handleMessage(msg: NetMessage, from: string) {
    switch (msg.t) {
      case "state": {
        if (msg.bots && this.isHost && from !== this.hostId) return; // stale host snapshot
        const seen = new Set<string>();
        for (const es of msg.e) {
          seen.add(es.id);
          if (this.owns(es.id)) continue;
          this.applyState(es);
        }
        if (msg.bots && !this.isHost) {
          for (const b of this.bots()) if (!seen.has(b.id)) this.world.entities.delete(b.id);
        }
        break;
      }
      case "shot":
        if (!this.owns(msg.s))
          this.world.events.push({
            type: "shot",
            shooter: msg.s,
            hit: null,
            fromX: msg.fx,
            fromY: msg.fy,
            toX: msg.tx,
            toY: msg.ty,
          });
        break;
      case "hit": {
        const victim = this.world.entities.get(msg.v);
        if (!victim || !this.owns(victim.id) || this.over) return;
        const attacker = this.world.entities.get(msg.a) ?? { id: msg.a };
        damage(this.world, victim, attacker, Math.max(0, Math.min(40, msg.d)));
        break;
      }
      case "kill": {
        // Kills are credited by the killer's owner (the victim's owner already logged it).
        const killer = this.world.entities.get(msg.k);
        if (killer && this.owns(killer.id)) killer.kills++;
        this.world.events.push({ type: "kill", killer: msg.k, victim: msg.v });
        break;
      }
      case "match":
        if (from === this.hostId) {
          this.matchLeft = msg.left;
          if (msg.over) this.over = true;
        }
        break;
    }
  }

  private applyState(es: EntState) {
    let e = this.world.entities.get(es.id);
    if (!e) {
      e = createEntity({ id: es.id, name: es.n, kind: es.k, team: this.teamOf(es.id), x: es.x, y: es.y });
      e.angle = es.a;
      this.world.entities.set(es.id, e);
    }
    const wasAlive = e.alive;
    e.name = es.n;
    e.kills = es.ki;
    e.deaths = es.de;
    if (es.hp < e.hp) e.hurtAt = this.world.time;
    e.hp = es.hp;
    e.alive = es.al;
    if (!wasAlive && es.al) {
      // Respawned: snap instead of sliding across the map.
      e.x = es.x;
      e.y = es.y;
      e.angle = es.a;
    }
    if (wasAlive && !es.al) e.hurtAt = this.world.time;
    this.targets.set(es.id, { x: es.x, y: es.y, a: es.a });
  }

  private snapshot(e: Entity): EntState {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      id: e.id,
      n: e.name,
      k: e.kind,
      x: r(e.x),
      y: r(e.y),
      a: r(e.angle),
      hp: e.hp,
      al: e.alive,
      ki: e.kills,
      de: e.deaths,
    };
  }

  private sendState() {
    this.transport.send({ t: "state", e: [this.snapshot(this.me)] });
    if (this.isHost) this.transport.send({ t: "state", e: this.bots().map((b) => this.snapshot(b)), bots: true });
  }

  // ------------------------------------------------------------------ tick

  step(dt: number, input: PlayerInput): WorldEvent[] {
    const w = this.world;
    tickWorld(w, dt);
    if (this.startedAt === 0) this.startedAt = w.time;

    if (!this.over) {
      const me = this.me;
      me.angle += input.turn;
      move(w, me, input.forward, input.strafe, dt);
      if (input.reload) startReload(w, me);
      if (input.fire) fire(w, me, this.rng);
      if (!me.alive && w.time >= me.respawnAt) respawn(w, me, this.rng);
    }

    // Interpolate remote entities toward their latest snapshot.
    const k = 1 - Math.exp(-15 * dt);
    for (const [id, t] of this.targets) {
      const e = w.entities.get(id);
      if (!e) {
        this.targets.delete(id);
        continue;
      }
      e.x += (t.x - e.x) * k;
      e.y += (t.y - e.y) * k;
      e.angle += Math.atan2(Math.sin(t.a - e.angle), Math.cos(t.a - e.angle)) * k;
    }

    if (this.isHost && !this.over) this.hostTick(dt);
    else if (!this.over) this.matchLeft = Math.max(0, this.matchLeft - dt);

    const events = drainEvents(w);
    for (const ev of events) {
      if (ev.type === "shot" && this.owns(ev.shooter)) {
        this.transport.send({ t: "shot", s: ev.shooter, fx: ev.fromX, fy: ev.fromY, tx: ev.toX, ty: ev.toY });
      } else if (ev.type === "kill" && this.owns(ev.victim)) {
        this.transport.send({ t: "kill", k: ev.killer, v: ev.victim });
        this.sendAcc = SEND_INTERVAL; // push the death out right away
      }
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
    for (const b of this.bots()) {
      if (!this.brains.has(b.id)) this.adoptBot(b);
      const brain = this.brains.get(b.id)!;
      if (!b.alive) {
        if (w.time >= b.respawnAt) respawn(w, b, this.rng);
        continue;
      }
      // Occasional noisy fix on the nearest human so bots find the action.
      const phase = (b.id.length * 0.9) % BOT_PULSE_S;
      if (Math.floor((w.time - phase) / BOT_PULSE_S) !== Math.floor((w.time - dt - phase) / BOT_PULSE_S)) {
        const humans = [...w.entities.values()].filter((e) => e.kind === "human" && e.alive);
        const near = humans.sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
        if (near) hintPosition(w, brain, near.x, near.y, 4, this.rng);
      }
      updateBot(w, b, brain, dt, this.rng);
    }

    this.matchLeft = Math.max(0, this.matchLeft - dt);
    const leader = Math.max(0, ...[...w.entities.values()].map((e) => e.kills));
    const done = this.matchLeft <= 0 || leader >= KILL_LIMIT;
    this.beatAcc += dt;
    if (this.beatAcc >= MATCH_BEAT || done) {
      this.beatAcc = 0;
      this.transport.send({ t: "match", left: Math.round(this.matchLeft), limit: KILL_LIMIT, over: done });
    }
    if (done) {
      this.sendState();
      this.over = true;
    }
  }

  // ------------------------------------------------------------------ HUD

  topLeft() {
    const m = Math.floor(this.matchLeft / 60);
    const s = Math.floor(this.matchLeft % 60)
      .toString()
      .padStart(2, "0");
    return [
      `${this.me.kills} KILLS · ${this.me.deaths} DEATHS`,
      `${m}:${s} · FIRST TO ${KILL_LIMIT} · ROOM ${this.room} · ${this.peers.length} ONLINE`,
    ];
  }

  banner(): HudState["banner"] {
    if (this.over) {
      const winner = this.standings()[0];
      return {
        text: winner?.me ? "VICTORY" : "MATCH OVER",
        sub: winner ? `${winner.name} wins` : undefined,
        color: "#ffcb3d",
      };
    }
    if (!this.me.alive) {
      return {
        text: "ELIMINATED",
        sub: `Respawning in ${Math.max(0, Math.ceil(this.me.respawnAt - this.world.time))}s`,
        color: "#ff4d6d",
      };
    }
    if (this.world.time - this.startedAt < 2.5)
      return { text: "DEATHMATCH", sub: `First to ${KILL_LIMIT} kills`, color: "#ff2bd6" };
    return null;
  }

  private standings() {
    return [...this.world.entities.values()]
      .map((e) => ({ name: e.name, kills: e.kills, deaths: e.deaths, me: e.id === this.me.id }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  scoreboard(showAll: boolean) {
    return showAll || this.over ? this.standings() : null;
  }

  isOver() {
    return this.over;
  }

  score() {
    return this.me.kills * 100;
  }

  nameOf(id: string) {
    return this.world.entities.get(id)?.name ?? (id === this.me.id ? this.me.name : "Player");
  }

  destroy() {
    this.unsubscribe.forEach((u) => u());
    this.transport.close();
  }
}
