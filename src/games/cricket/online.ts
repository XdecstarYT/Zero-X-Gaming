import { electHost, type PeerInfo, type Transport } from "../neon-siege/net";
import { CricketSim, emptyInput, type CricketInput, type Delivery, type Fielder, type FieldSet, type Innings, type Phase, type Pose, type ShotType, type SimEvent, type V3 } from "./sim";
import { teamById } from "./teams";

/**
 * Boundary Blitz online: two people, one room. The host (whoever got there
 * first) runs the match; the guest's sim is a puppet fed by the host's
 * snapshots, sending its inputs back. Timing stays fair both ways: when the
 * guest bats, each delivery is flown on the guest's own screen and the press
 * is sent with its delivery time (the host holds the ball at the bat until it
 * arrives); when the guest bowls, the meter value they saw is what's used.
 */

export interface MatchConfig {
  /** [host's team, guest's team]. */
  teams: [string, string];
  names: [string, string];
  overs: number;
  batFirst: 0 | 1;
  seed: number;
}

type V = [number, number, number];
interface FrameMsg {
  ph: Phase;
  pt: number;
  t: number;
  cur: number;
  b: V;
  v: V;
  bv: boolean;
  bo: boolean;
  th: boolean;
  /** Fielders: x, z, heading, pose, act, speed. */
  f: [number, number, number, Pose, number, number][];
  /** Batters: x, z, heading, pose, act, shot. */
  bt: [number, number, number, Pose, number, string][];
  u: string[];
  br: [number, number];
  m: number;
  ml: number | null;
  fs: FieldSet;
  ls: string | null;
}
interface InningsMsg extends Omit<Innings, "bowl"> {
  bowl: [number, { balls: number; runs: number; wkts: number }][];
}
interface StateMsg {
  inn: InningsMsg[];
  cur: number;
  fl: [number, Fielder["role"]][];
  res: { text: string; runs: number; wicket: boolean } | null;
  rb: number[];
  wb: number[];
  sb: number[];
  lb: number[];
  win: 0 | 1 | null;
  txt: string;
  done: boolean;
}

export type CricketMsg =
  | { t: "hello"; name: string; team: string }
  | { t: "start"; cfg: MatchConfig }
  | { t: "f"; s: FrameMsg; e: SimEvent[] }
  | { t: "st"; s: StateMsg }
  | { t: "rel"; ball: V3; vel: V3; d: Delivery; cz: number }
  | { t: "in"; i: Partial<CricketInput> }
  | { t: "bye" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const v3 = (p: V3): V => [r2(p.x), r2(p.y), r2(p.z)];
const unv = (v: V): V3 => ({ x: v[0], y: v[1], z: v[2] });

export function frameOf(sim: CricketSim): FrameMsg {
  return {
    ph: sim.phase,
    pt: r2(sim.pt),
    t: r2(sim.t),
    cur: sim.cur,
    b: v3(sim.ball),
    v: v3(sim.vel),
    bv: sim.ballVisible,
    bo: sim.bounced,
    th: sim.isThrown,
    f: sim.fielders.map((f) => [r2(f.x), r2(f.z), r2(f.heading), f.pose, r2(f.act), r2(f.speed)]),
    bt: sim.batters.map((b) => [r2(b.x), r2(b.z), r2(b.heading), b.pose, r2(b.act), b.shot]),
    u: sim.umpires.map((u) => u.pose),
    br: [r2(sim.broken[0]), r2(sim.broken[1])],
    m: r2(sim.meter),
    ml: sim.meterLocked,
    fs: sim.field,
    ls: sim.lastShot?.type ?? null,
  };
}

export function stateOf(sim: CricketSim): StateMsg {
  return {
    inn: sim.innings.map((i) => ({ ...i, bowl: [...i.bowl.entries()] })),
    cur: sim.cur,
    fl: sim.fielders.map((f) => [f.p, f.role]),
    res: sim.result,
    rb: sim.runsBy,
    wb: sim.wktsBy,
    sb: sim.sixesBy,
    lb: sim.longestBy,
    win: sim.winner,
    txt: sim.resultText,
    done: sim.phase === "done",
  };
}

/** The key the host watches to know when to send the full state again. */
export const stateKey = (sim: CricketSim) => `${sim.cur}|${sim.inn.runs}|${sim.inn.wkts}|${sim.inn.balls}|${sim.inn.over.length}|${sim.inn.bowler}|${sim.phase === "done"}|${sim.fielders.length}`;

export function applyState(sim: CricketSim, s: StateMsg) {
  sim.innings = s.inn.map((i) => ({ ...i, bowl: new Map(i.bowl) }));
  sim.cur = s.cur;
  // Make sure there are fielders for the roles the host has.
  sim.fielders = s.fl.map(([p, role], k) => sim.fielders[k] && sim.fielders[k].p === p ? sim.fielders[k] : { p, role, x: 0, z: 0, hx: 0, hz: 0, heading: 0, speed: 0, pose: "stand", act: 0, goal: null });
  sim.result = s.res;
  sim.runsBy = s.rb;
  sim.wktsBy = s.wb;
  sim.sixesBy = s.sb;
  sim.longestBy = s.lb;
  if (s.done) {
    sim.setResult(s.win, s.txt);
    sim.phase = "done";
  }
}

export function applyFrame(sim: CricketSim, f: FrameMsg) {
  if (sim.phase === "done") return;
  const flying = sim.localFlight && f.ph === "delivery" && sim.phase === "delivery";
  if (f.ph !== "delivery" && sim.phase === "delivery") {
    sim.localFlight = false;
    sim.localPress = -1;
    sim.localLeave = false;
  }
  sim.phase = f.ph;
  if (!flying) {
    sim.pt = f.pt;
    sim.t = f.t;
    sim.ball = unv(f.b);
    sim.vel = unv(f.v);
    sim.ballVisible = f.bv;
    sim.bounced = f.bo;
    f.bt.forEach((b, i) => {
      const x = sim.batters[i];
      if (!x) return;
      [x.x, x.z, x.heading, x.pose, x.act] = [b[0], b[1], b[2], b[3], b[4]];
      x.shot = b[5] as ShotType;
    });
  }
  sim.netThrown = f.th;
  f.f.forEach((v, i) => {
    const x = sim.fielders[i];
    if (!x) return;
    [x.x, x.z, x.heading, x.pose, x.act, x.speed] = v;
  });
  f.u.forEach((p, i) => {
    if (sim.umpires[i]) sim.umpires[i].pose = p as CricketSim["umpires"][number]["pose"];
  });
  sim.broken = [f.br[0], f.br[1]];
  // Keep your own meter while you're bowling it.
  if (!(sim.humanBowls && f.ph === "runup")) {
    sim.meter = f.m;
    sim.meterLocked = f.ml;
  }
  sim.field = f.fs;
  if (!f.ls) sim.lastShot = null;
  else if (!sim.lastShot || sim.lastShot.type !== f.ls) sim.lastShot = { type: f.ls as "hit" | "edge" | "miss", speed: 0, dir: 0, elev: 0, quality: 0, label: "" };
}

/** The guest's view of a release: fly it here if it's your turn to bat. */
export function applyRelease(sim: CricketSim, m: Extract<CricketMsg, { t: "rel" }>) {
  sim.phase = "delivery";
  sim.delivery = m.d;
  sim.ball = { ...m.ball };
  sim.vel = { ...m.vel };
  sim.contactZ = m.cz;
  sim.t = 0;
  sim.pt = 0;
  sim.bounced = false;
  sim.ballVisible = true;
  sim.lastShot = null;
  sim.localFlight = sim.humanBats;
  sim.localPress = -1;
  sim.localLeave = false;
  if (sim.batters[0]) {
    sim.batters[0].pose = "stance";
    sim.batters[0].act = 0;
  }
}

/** Build the match on either side. */
export function matchFrom(cfg: MatchConfig, side: 0 | 1) {
  const sim = new CricketSim({
    teams: [teamById(cfg.teams[0]), teamById(cfg.teams[1])],
    human: side,
    versus: true,
    batFirst: cfg.batFirst,
    overs: cfg.overs,
    difficulty: "pro",
    mode: "match",
    seed: cfg.seed,
  });
  sim.puppet = side === 1;
  return sim;
}

/**
 * The room: who's here, who hosts, and the match messages. One instance per
 * client; `host` and `guest` drive the two ends of a match.
 */
export class CricketLink {
  peers: PeerInfo[] = [];
  byeAt = 0;
  /** When we last heard from the other player (ms). */
  lastHeard = Date.now();
  opponent: { name: string; team: string } | null = null;
  private offs: (() => void)[] = [];
  onChange: () => void = () => {};
  onStart: (cfg: MatchConfig) => void = () => {};
  onMsg: (m: CricketMsg) => void = () => {};

  constructor(
    readonly transport: Transport<CricketMsg>,
    public name: string,
    public team: string,
  ) {}

  async connect() {
    this.offs.push(
      this.transport.onPeers((p) => {
        this.peers = p;
        const others = p.filter((x) => x.id !== this.transport.selfId);
        if (!others.length) this.opponent = null;
        this.hello();
        this.onChange();
      }),
      this.transport.onMessage((m) => {
        this.lastHeard = Date.now();
        if (m.t === "hello") {
          this.opponent = { name: m.name, team: m.team };
          this.onChange();
        } else if (m.t === "start") this.onStart(m.cfg);
        else if (m.t === "bye") this.byeAt = Date.now();
        else this.onMsg(m);
      }),
    );
    await this.transport.connect();
    this.hello();
  }

  hello() {
    this.transport.send({ t: "hello", name: this.name, team: this.team });
  }

  get isHost() {
    return electHost(this.peers) === this.transport.selfId;
  }
  get full() {
    return this.peers.length > 2 && !this.peers.slice().sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 2).some((p) => p.id === this.transport.selfId);
  }
  /** The other player has gone: out of the room and silent for a while (connections hiccup). */
  get opponentGone() {
    return this.byeAt > 0 || (this.peers.length < 2 && Date.now() - this.lastHeard > 20_000);
  }
  get ready() {
    return this.peers.length >= 2 && !!this.opponent;
  }

  /** Host: start the match (the guest gets the same config). */
  start(overs: number, seed = Date.now() & 0x7fffffff): MatchConfig {
    let guestTeam = this.opponent?.team ?? "blaze";
    if (guestTeam === this.team) guestTeam = this.team === "blaze" ? "cyclones" : "blaze";
    const cfg: MatchConfig = { teams: [this.team, guestTeam], names: [this.name, this.opponent?.name ?? "Guest"], overs, batFirst: seed % 2 ? 0 : 1, seed };
    this.transport.send({ t: "start", cfg });
    return cfg;
  }

  send(m: CricketMsg) {
    this.transport.send(m);
  }

  close() {
    try {
      this.transport.send({ t: "bye" });
    } catch {
      // Already gone.
    }
    this.offs.forEach((f) => f());
    this.transport.close();
  }
}

/** Host side: step the match with the guest's input, stream it back. */
export class HostPump {
  private remote = emptyInput();
  private frameAt = 0;
  private stateAt = 0;
  private lastKey = "";
  private events: SimEvent[] = [];
  private guestIn = false;
  private startAt = 0;

  constructor(
    private sim: CricketSim,
    private link: CricketLink,
    private cfg?: MatchConfig,
  ) {
    link.onMsg = (m) => {
      if (m.t === "in") {
        this.guestIn = true;
        this.input(m.i);
      }
    };
    this.sendState();
  }

  private input(i: Partial<CricketInput>) {
    const r = this.remote;
    if (i.aim !== undefined) r.aim = i.aim;
    if (i.kind) r.kind = i.kind;
    if (i.target) r.target = i.target;
    if (i.field) r.field = i.field;
    if (i.shot) {
      r.shot = i.shot;
      r.pressAt = i.pressAt;
    }
    if (i.leave) r.leave = true;
    if (i.run) r.run = true;
    if (i.bowl) {
      r.bowl = true;
      r.meter = i.meter;
    }
    if (i.next) r.next = true;
  }

  /** One step: returns the sim events for the host's own view. */
  step(dt: number, local: CricketInput, now: number) {
    const sim = this.sim;
    // Until the guest checks in, keep telling them the match has started.
    if (this.cfg && !this.guestIn && now - this.startAt > 1000) {
      this.startAt = now;
      this.link.send({ t: "start", cfg: this.cfg });
      this.sendState(now);
    }
    sim.step(dt, local, this.remote);
    // One-shot inputs are used once.
    const r = this.remote;
    r.shot = null;
    r.pressAt = undefined;
    r.run = r.bowl = r.next = r.leave = false;
    r.meter = undefined;
    const ev = sim.events.slice();
    sim.events.length = 0;
    for (const e of ev) {
      if (e.kind === "release") this.link.send({ t: "rel", ball: sim.ball, vel: sim.vel, d: sim.delivery!, cz: sim.contactZ });
      this.events.push(e);
    }
    const key = stateKey(sim);
    if (key !== this.lastKey || now - this.stateAt > 1000) this.sendState(now);
    // Key moments go out straight away; the rest at 15 a second.
    const urgent = ev.some((e) => e.kind === "inningsEnd" || e.kind === "matchEnd" || e.kind === "out" || e.kind === "overEnd");
    if (urgent || now - this.frameAt > 66) {
      this.frameAt = now;
      this.link.send({ t: "f", s: frameOf(sim), e: this.events });
      this.events = [];
    }
    return ev;
  }

  sendState(now = 0) {
    this.lastKey = stateKey(this.sim);
    this.stateAt = now;
    this.link.send({ t: "st", s: stateOf(this.sim) });
  }
}

/** Guest side: apply the host's snapshots, send your input. */
export class GuestPump {
  private events: SimEvent[] = [];
  private sentAim = 999;
  private sentPlan = "";
  private sentLeave = false;
  private aimAt = 0;
  private sentAt = 0;

  constructor(
    private sim: CricketSim,
    private link: CricketLink,
  ) {
    link.onMsg = (m) => {
      if (m.t === "st") applyState(sim, m.s);
      else if (m.t === "rel") {
        applyRelease(sim, m);
        this.sentLeave = false;
      } else if (m.t === "f") {
        applyFrame(sim, m.s);
        // The host's view of the release comes in the next frame; skip it for the batter.
        this.events.push(...m.e.filter((e) => !(sim.localFlight && e.kind === "bounce")));
      }
    };
  }

  /** One frame: your input goes to the host; returns the events to show. */
  step(dt: number, local: CricketInput, now: number) {
    const sim = this.sim;
    sim.step(dt, local);
    const out: Partial<CricketInput> = {};
    if (sim.humanBats) {
      if (Math.abs(local.aim - this.sentAim) > 1 && now - this.aimAt > 80) {
        out.aim = local.aim;
        this.sentAim = local.aim;
        this.aimAt = now;
      }
      if (local.shot && sim.phase === "delivery" && sim.localFlight) {
        const at = sim.localShot(local.shot);
        if (at >= 0) {
          out.shot = local.shot;
          out.pressAt = at;
          out.aim = local.aim;
        }
      }
      if (sim.localLeave && !this.sentLeave) {
        out.leave = true;
        this.sentLeave = true;
      }
      if (local.run) out.run = true;
    }
    if (sim.humanBowls) {
      const plan = `${local.kind}|${local.field}|${local.target.x.toFixed(2)}|${local.target.z.toFixed(2)}`;
      if (plan !== this.sentPlan) {
        Object.assign(out, { kind: local.kind, field: local.field, target: { ...local.target } });
        this.sentPlan = plan;
      }
      if (local.bowl) {
        out.bowl = true;
        if (sim.phase === "runup" && sim.meterLocked === null) {
          sim.meterLocked = sim.meter;
          out.meter = sim.meter;
        }
      }
    }
    if (local.next) out.next = true;
    // A keep-alive even when there's nothing to send, so the host knows you're still here.
    if (Object.keys(out).length || now - this.sentAt > 2000) {
      this.link.send({ t: "in", i: out });
      this.sentAt = now;
    }
    const ev = [...sim.events, ...this.events];
    sim.events.length = 0;
    this.events = [];
    return ev;
  }
}
