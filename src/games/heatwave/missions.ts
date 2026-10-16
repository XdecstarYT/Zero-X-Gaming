import { LEADS, OUTFITS, VEHICLES, WEAPONS, type CharId, type VehicleKind, type WeaponId } from "./data";
import { aimAt, damage, fire, startReload } from "./combat";
import { crime, raise } from "./police";
import { carById, earn, emit, leadLook, makeCar, makePed, pedById, player, playerCar, playerPos, poi, speedOf, toast, type Car, type MissionRun, type Ped, type State } from "./state";
import { randomLook } from "./traffic";
import { leave, seat } from "./vehicles";
import { groundY, route, WATER_Y } from "./world";

/**
 * The story of Nina Cruz and Dex Holloway, twelve missions across Melbourne, and the side jobs:
 * milk bar hold-ups, street races, cars for the chop shop and the hidden sun tokens.
 *
 * A mission is a list of steps; each step sets itself up once and then reports each tick
 * whether it's done, still going, or failed (and why). Mission people and vehicles are tagged
 * so the streets don't take them away.
 */

type Res = "next" | string | void;
interface Step {
  enter?: (s: State, r: MissionRun) => void;
  tick: (s: State, r: MissionRun, dt: number) => Res;
}

export interface MissionDef {
  id: string;
  name: string;
  lead: CharId;
  /** The contact who gives it. */
  from: string;
  /** Where it starts. */
  x: number;
  z: number;
  blurb: string;
  pay: number;
  steps: Step[];
}

/* ------------------------------------------------------------------ step kit */

const say = (who: string, text: string) => (s: State) => emit(s, { kind: "dialog", who, text });

function talk(lines: [string, string][], gap = 3.2): Step {
  return {
    enter: (s, r) => {
      r.n = 0;
      r.timer = 0;
      r.goal = null;
      say(lines[0][0], lines[0][1])(s);
    },
    tick: (s, r, dt) => {
      r.timer += dt;
      if (r.timer >= gap) {
        r.timer = 0;
        r.n++;
        if (r.n >= lines.length) return "next";
        say(lines[r.n][0], lines[r.n][1])(s);
      }
    },
  };
}

/** A place: fixed (local metres on the real map) or a POI's door, looked up in the city. */
type Spot = { x: number; z: number } | string;
const at = (s: State, p: Spot) => (typeof p === "string" ? poi(s.city, p) : p);

function goTo(to: Spot, text: string, o: { r?: number; car?: boolean; foot?: boolean; tag?: string; stop?: boolean } = {}): Step {
  return {
    enter: (s, r) => {
      const { x, z } = at(s, to);
      r.text = text;
      r.goal = { x, z, r: o.r ?? 5 };
    },
    tick: (s, r) => {
      const { x, z } = at(s, to);
      const pos = playerPos(s);
      const c = playerCar(s);
      if (o.tag) {
        const t = taggedCar(s, r, o.tag);
        if (!t) return "The car was lost.";
        if (t.wrecked) return "The car was destroyed.";
        if (c !== t) {
          r.text = "Get back in the car.";
          r.goal = { x: t.x, z: t.z, r: 3 };
          return;
        }
        r.text = text;
        r.goal = { x, z, r: o.r ?? 5 };
      }
      if (o.car && !c) return;
      if (o.foot && c) return;
      if (Math.hypot(pos.x - x, pos.z - z) > (o.r ?? 5)) return;
      if (o.stop && c && speedOf(c) > 2) return;
      return "next";
    },
  };
}

/** Go to a fixed place (its door), in a car or on foot. */
function goToPoi(id: string, text: string, r = 6, foot = false): Step {
  return {
    enter: (s, run) => {
      const p = poi(s.city, id);
      run.text = text;
      run.goal = { x: p.x, z: p.z, r };
    },
    tick: (s) => {
      const p = poi(s.city, id);
      const pos = playerPos(s);
      if (foot && playerCar(s)) return;
      return Math.hypot(pos.x - p.x, pos.z - p.z) <= r ? "next" : undefined;
    },
  };
}

function lose(text = "Lose the police."): Step {
  return {
    enter: (s, r) => {
      r.text = text;
      r.goal = null;
    },
    tick: (s) => (s.wanted.level === 0 && s.wanted.pending === 0 ? "next" : undefined),
  };
}

function wantedStep(level: number): Step {
  return {
    tick: (s) => {
      const pos = playerPos(s);
      raise(s, level, pos.x, pos.z);
      return "next";
    },
  };
}

function wait(sec: number, text?: string): Step {
  return {
    enter: (s, r) => {
      r.timer = sec;
      if (text) r.text = text;
    },
    tick: (s, r, dt) => {
      r.timer -= dt;
      return r.timer <= 0 ? "next" : undefined;
    },
  };
}

function act(fn: (s: State, r: MissionRun) => void): Step {
  return { tick: (s, r) => (fn(s, r), "next") };
}

/** Kill everyone tagged `tag`. */
function killAll(tag: string, text: string): Step {
  return {
    enter: (s, r) => {
      r.text = text;
      r.goal = null;
    },
    tick: (s, r) => {
      const left = s.peds.filter((p) => p.tag === `${r.id}:${tag}` && p.state !== "dead");
      if (!left.length) return "next";
      r.text = `${text} (${left.length} left)`;
    },
  };
}

function taggedCar(s: State, r: MissionRun, tag: string) {
  return s.cars.find((c) => c.tag === `${r.id}:${tag}`);
}
function taggedPed(s: State, r: MissionRun, tag: string) {
  return s.peds.find((p) => p.tag === `${r.id}:${tag}`);
}

function spawnCar(s: State, r: MissionRun, tag: string, kind: VehicleKind, x: number, z: number, h: number, color?: string) {
  const c = makeCar(s, kind, x, z, h, color, { tag: `${r.id}:${tag}` });
  c.ai.mode = "parked";
  r.cars.push(c.id);
  return c;
}

function spawnPed(s: State, r: MissionRun, tag: string, x: number, z: number, o: { weapon?: WeaponId; shirt?: string; pants?: string; hostile?: boolean; hp?: number; role?: Ped["role"]; mode?: Ped["ai"]["mode"] } = {}) {
  const look = randomLook(s);
  if (o.shirt) look.shirt = o.shirt;
  if (o.pants) look.pants = o.pants;
  const w = o.weapon ?? "fists";
  const p = makePed(s, o.role ?? "mission", x, z, s.rng.range(0, 6.28), look, { weapon: w, clip: WEAPONS[w].clip, ammo: { [w]: 300 }, hostile: !!o.hostile, hp: o.hp ?? 100, maxHp: o.hp ?? 100, tag: `${r.id}:${tag}` });
  p.ai.mode = o.mode ?? (o.hostile ? "guard" : "idle");
  p.ai.dx = x;
  p.ai.dz = z;
  r.peds.push(p.id);
  return p;
}

/** The other lead, along for the ride, armed. */
function partnerJoin(weapon: WeaponId = "pistol"): Step {
  return {
    tick: (s, r) => {
      const other = s.chars[s.active === 0 ? 1 : 0];
      const pl = player(s);
      const out = OUTFITS.find((o) => o.id === other.outfit) ?? OUTFITS[0];
      const p = makePed(s, "partner", pl.x - Math.sin(pl.h) * 1.5, pl.z + Math.cos(pl.h) * 1.5, pl.h, leadLook(other, out), { weapon, clip: WEAPONS[weapon].clip, ammo: { [weapon]: 999 }, hp: 200, maxHp: 200, armor: 50, tag: `${r.id}:partner` });
      p.ai.mode = "follow";
      p.ai.target = pl.id;
      r.peds.push(p.id);
      return "next";
    },
  };
}

/** A partner follows the player, into the passenger seat and out again. */
function partnerTick(s: State, r: MissionRun) {
  const p = taggedPed(s, r, "partner");
  if (!p) return;
  if (p.state === "dead") return `${p.look.female ? "Nina" : "Dex"} didn't make it.`;
  const pl = player(s);
  const pc = playerCar(s);
  p.ai.target = pl.id;
  if (pc && p.car !== pc.id) {
    if (p.car >= 0) leave(s, p);
    const free = pc.seats.indexOf(-1, 1);
    if (free < 0) return;
    const d = Math.hypot(pc.x - p.x, pc.z - p.z);
    if (d < 3.4 || (d > 60 && speedOf(pc) < 1)) seat(s, p, pc, free);
    else if (p.state === "ok") {
      p.ai.mode = "follow";
    }
  } else if (!pc && p.car >= 0) {
    leave(s, p);
    p.ai.mode = "follow";
  }
}

/** Hold up a shop: stand at the till with a gun out until the drawer's empty. */
function holdUp(storeId: string, take: [number, number], text = "Point your gun at the clerk and hold it there."): Step {
  return {
    enter: (s, r) => {
      const st = poi(s.city, storeId);
      r.text = text;
      r.goal = { x: st.x, z: st.z, r: 2.6 };
      r.n = 0;
      r.timer = 0;
    },
    tick: (s, r, dt) => {
      const st = poi(s.city, storeId);
      const pl = player(s);
      if (pl.car >= 0) return;
      if (Math.hypot(pl.x - st.x, pl.z - st.z) > 3.2) {
        r.timer = Math.max(0, r.timer - dt);
        return;
      }
      if (!pl.aiming || WEAPONS[pl.weapon].melee) {
        r.text = "Draw a gun and aim (hold aim) at the till.";
        return;
      }
      r.text = "Keep it on them...";
      r.timer += dt;
      if (r.timer > 6) {
        const n = s.rng.int(take[0], take[1]);
        r.pay += n;
        s.story.robbed[storeId] = s.t;
        s.stats.stores++;
        crime(s, "robbery", st.x, st.z);
        emit(s, { kind: "money", n, text: "The take" });
        return "next";
      }
    },
  };
}

/** Destroy or stop a car (it's escaping if it gets too far). */
function stopCar(tag: string, text: string, o: { far?: number; stopAt?: number } = {}): Step {
  return {
    enter: (s, r) => {
      r.text = text;
    },
    tick: (s, r) => {
      const c = taggedCar(s, r, tag);
      if (!c || c.wrecked) return "next";
      r.goal = { x: c.x, z: c.z, r: 0 };
      if (o.stopAt !== undefined && c.hp < VEHICLES[c.kind].hp * o.stopAt) {
        c.ai.mode = "idle";
        return "next";
      }
      const pos = playerPos(s);
      if (Math.hypot(c.x - pos.x, c.z - pos.z) > (o.far ?? 260)) return "They got away.";
    },
  };
}

function setCarGoto(c: Car, s: State, pts: { x: number; z: number }[], cruise: number) {
  c.ai.mode = "goto";
  c.ai.path = pts;
  c.ai.pi = 0;
  c.ai.cruise = cruise;
}

/** A road route through a list of points. */
function roadPath(s: State, pts: { x: number; z: number }[]) {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(...route(s.city, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z));
  return out;
}

/* ------------------------------------------------------------------ the places */

/**
 * Mission places on the real map (local metres from Flinders and Swanston Sts, x east, z south),
 * each checked against the map data: on the road, at the kerb, on the footpath, on a pier deck or
 * in open water as it needs to be.
 */
const P = {
  dockGate: { x: -3350.5, z: -995.5 },
  yard: { x: -3300, z: -605 },
  lockup: { x: -3469.5, z: -2633.5 },
  debtors: [
    { x: 2650.5, z: 877.5 },
    { x: 990, z: -2120 },
    { x: -193, z: 300 },
  ],
  vince: { x: -10.5, z: -2072.5 },
  stkBoat: { x: -560, z: 4790 },
  stkEnd: { x: -425, z: 4835 },
  stkMid: { x: -356, z: 5012 },
  /** Along St Kilda Pier past the middle, out towards the kiosk. */
  pierOut: [
    { x: -372, z: 4950 },
    { x: -380, z: 4930 },
    { x: -392, z: 4904 },
    { x: -400, z: 4885 },
    { x: -410, z: 4865 },
    { x: -418, z: 4850 },
    { x: -425, z: 4835 },
  ],
  /** Across the bay from St Kilda to Station Pier and past it. */
  courier: [
    { x: -1000, z: 4600 },
    { x: -1600, z: 4200 },
    { x: -2200, z: 3800 },
    { x: -2800, z: 3500 },
    { x: -3150, z: 3350 },
    { x: -3350, z: 2950 },
  ],
  courierAt: { x: -700, z: 4850 },
  stationEnd: { x: -3255, z: 3300 },
  trek: { x: 2660.5, z: 667.5, h: -2.99 },
  armStart: { x: -478, z: 1975, h: -1.92 },
  bankRoad: { x: -681.5, z: -22 },
  bankBack: { x: -677, z: 89 },
  bankSide: { x: -705, z: 34.5 },
  getaway: { x: -680.5, z: -19, h: 2.79 },
  salStart: { x: -2573.5, z: 2360, h: -1.06 },
  salRun: [
    { x: 341, z: 1913 },
    { x: 2496, z: 2412 },
    { x: 3381, z: 2547 },
  ],
  yacht: { x: -2190, z: 110 },
  yarraMouth: { x: -4250, z: 160 },
};

/** The bank's front door, and the way along its street. */
function bankDoor(s: State) {
  const b = poi(s.city, "bank");
  return { x: b.x, z: b.z, fx: b.fx, fz: b.fz, tx: -b.fz, tz: b.fx };
}

/* ------------------------------------------------------------------ the story */

const SAL = "#c9853a";

export const STORY: MissionDef[] = [
  {
    id: "sunburn",
    name: "Knock-Off",
    lead: "nina",
    from: "Nina",
    x: 0,
    z: 0,
    blurb: "Dex has walked off his last shift at Appleton Dock. Pick him up before he does something stupid.",
    pay: 500,
    steps: [
      talk([
        ["Dex", "Nina? It's me. They let me go. Twelve years on the wharf, and they let me go."],
        ["Nina", "Where are you?"],
        ["Dex", "Outside the gate on Footscray Rd. Come get me before I put the foreman in the drink."],
      ]),
      {
        enter: (s, r) => {
          r.text = "Get in your car (the red Stallion out the front).";
          const c = s.cars.find((x) => x.tag === "ride-nina" && !x.wrecked);
          r.goal = c ? { x: c.x, z: c.z, r: 3 } : null;
        },
        tick: (s) => (playerCar(s) ? "next" : undefined),
      },
      goTo(P.dockGate, "Drive to the Appleton Dock gate off Footscray Rd.", { car: true, r: 14 }),
      partnerJoin("fists"),
      talk([
        ["Dex", "Twelve years. You know what I've got to show for it? A crook back and a loan off Vince Kostas."],
        ["Nina", "Vince Kostas? From Footscray? Dex..."],
        ["Dex", "Just take me home. I need to think."],
      ]),
      goTo("safe-dex", "Take Dex home to his cottage in Port Melbourne.", { car: true, r: 14, stop: true }),
      talk([
        ["Nina", "Get some sleep. Ring me tomorrow."],
        ["Dex", "I've got an idea, Nina. You're not gonna like it."],
      ]),
    ],
  },
  {
    id: "change",
    name: "Milk Run",
    lead: "dex",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "Vince wants his first payment. Dex knows a milk bar in South Melbourne with a fat till and no camera.",
    pay: 0,
    steps: [
      talk([
        ["Dex", "Vince wants a payment by Friday. I've got eleven bucks and a Myki card."],
        ["Dex", "There's a pistol in the drawer. And a milk bar on Park St with no camera."],
      ]),
      act((s) => {
        const p = player(s);
        if (p.ammo.pistol === undefined) {
          p.ammo.pistol = 36;
          emit(s, { kind: "pickup", text: "Pistol" });
        }
      }),
      goTo("store-3", "Get to the milk bar on Park St, South Melbourne.", { r: 14 }),
      holdUp("store-3", [1200, 1800]),
      lose("The alarm's gone off. Lose the cops."),
      goTo("safe-dex", "Lie low back at the cottage.", { r: 12 }),
    ],
  },
  {
    id: "wheels",
    name: "Toorak Tourist",
    lead: "nina",
    from: "Ricky at Dockside Motors",
    x: 0,
    z: 0,
    blurb: "Dockside Motors will pay well for a Furia RS. There's one in a driveway in Toorak.",
    pay: 6000,
    steps: [
      talk([
        ["Ricky", "You're Nina? Dex reckons you can drive. I need a Furia RS, and I need it clean."],
        ["Ricky", "Coonara House in Toorak. Owner's in Noosa; his security isn't."],
      ]),
      act((s, r) => {
        const v = poi(s.city, "mansion");
        spawnCar(s, r, "furia", "furia", v.x - v.fx * 2 + 8, v.z - v.fz * 2 - 9, Math.PI / 2, "#3fd0c9");
        for (let i = 0; i < 2; i++) spawnPed(s, r, "guard", v.x - 6 + i * 12, v.z - 4, { weapon: "pistol", shirt: "#1c1f24", pants: "#1c1f24", hostile: false, mode: "guard" });
      }),
      act((s, r) => {
        const v = poi(s.city, "mansion");
        r.goal = { x: v.x, z: v.z, r: 30 };
      }),
      goToPoi("mansion", "Drive out to Toorak.", 30),
      {
        enter: (s, r) => {
          r.text = "Take the Furia RS (the guards will fight for it).";
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "furia");
          if (!c || c.wrecked) return "The Furia was destroyed.";
          r.goal = { x: c.x, z: c.z, r: 3 };
          for (const g of s.peds.filter((p) => p.tag === `${r.id}:guard` && p.state === "ok")) {
            const pl = player(s);
            if (Math.hypot(pl.x - c.x, pl.z - c.z) < 14 && !g.hostile) {
              g.hostile = true;
              g.ai.mode = "fight";
              g.ai.target = pl.id;
            }
          }
          if (playerCar(s) === c) return "next";
        },
      },
      {
        enter: (s, r) => {
          const ch = poi(s.city, "chop");
          r.text = "Deliver it to Dockside Motors without wrecking it.";
          r.goal = { x: ch.x, z: ch.z, r: 7 };
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "furia");
          if (!c || c.wrecked) return "The Furia was destroyed.";
          const ch = poi(s.city, "chop");
          if (playerCar(s) !== c) {
            r.text = "Get back in the Furia.";
            return;
          }
          const hp = c.hp / VEHICLES.furia.hp;
          r.text = `Deliver it to Dockside Motors (condition ${Math.max(0, Math.round(hp * 100))}%).`;
          if (hp < 0.35) return "The Furia's too damaged now.";
          if (Math.hypot(c.x - ch.x, c.z - ch.z) < 8 && speedOf(c) < 2) {
            if (s.wanted.level > 0) {
              r.text = "Lose the cops first: Ricky won't open the roller door with the cops on you.";
              return;
            }
            r.pay = Math.round(6000 * Math.min(1, hp + 0.15));
            leave(s, player(s));
            c.tag = "";
            c.own = false;
            c.ai.mode = "parked";
            return "next";
          }
        },
      },
      talk([["Ricky", "Beauty. Come back any time: there's a car I want every day. Check the board."]]),
    ],
  },
  {
    id: "collect",
    name: "Collections",
    lead: "dex",
    from: "Vince Kostas",
    x: 0,
    z: 0,
    blurb: "Vince will take the debt in work instead: collect from three people who owe him.",
    pay: 2500,
    steps: [
      talk([
        ["Vince", "Dex. You're short. But you've got big hands, and three of my friends have short memories."],
        ["Vince", "Remind them. Bring me what they owe. Don't kill anybody: dead blokes don't pay."],
      ]),
      act((s, r) => {
        r.n = 0;
        P.debtors.forEach(({ x, z }, i) => spawnPed(s, r, `debtor${i}`, x, z, { weapon: i === 1 ? "bat" : "fists", mode: "idle", hp: 70 }));
      }),
      ...[0, 1, 2].flatMap((i): Step[] => [
        {
          enter: (s, r) => {
            r.text = `Collect from debtor ${i + 1} of 3 (${["Swan St, Richmond", "Brunswick St, Fitzroy", "the Southbank promenade"][i]}): knock them down.`;
          },
          tick: (s, r) => {
            const d = taggedPed(s, r, `debtor${i}`);
            if (!d) return "A debtor got away.";
            r.goal = { x: d.x, z: d.z, r: 0 };
            if (d.state === "dead") return "Vince said don't kill anybody.";
            const pl = player(s);
            if (Math.hypot(pl.x - d.x, pl.z - d.z) < 12 && d.ai.mode === "idle") {
              d.ai.mode = s.rng.next() < 0.5 ? "fight" : "flee";
              d.ai.target = pl.id;
              d.ai.dx = pl.x;
              d.ai.dz = pl.z;
              d.ai.timer = 30;
            }
            if (d.state === "down") {
              s.pickups.push({ id: s.nextId++, kind: "cash", x: d.x + 0.6, z: d.z, n: 400 + i * 150, respawn: 0, takenAt: -1 });
              d.hp = Math.max(d.hp, 20);
              d.ai.mode = "cower";
              d.ai.timer = 30;
              d.tag = "";
              return "next";
            }
          },
        },
      ]),
      goTo(P.vince, "Bring the money to Vince at Caffè Milano on Lygon St.", { r: 4, foot: true }),
      talk([["Vince", "See? Everybody's happy. Keep a little for yourself. I'll be in touch."]]),
    ],
  },
  {
    id: "lowtide",
    name: "Low Tide",
    lead: "nina",
    from: "Ricky at Dockside Motors",
    x: 0,
    z: 0,
    blurb: "A courier's running a package across the bay by boat. Ricky wants it. There's a speedboat at the end of St Kilda Pier.",
    pay: 3500,
    steps: [
      talk([
        ["Ricky", "A courier runs a package across the bay to Station Pier every Tuesday. Today's Tuesday."],
        ["Ricky", "There's a speedboat tied up at the end of St Kilda Pier. Keys are in it. Don't ask."],
      ]),
      act((s, r) => {
        spawnCar(s, r, "boat", "speedboat", P.stkBoat.x, P.stkBoat.z, 2.4, "#e8e8e6");
      }),
      goTo(P.stkEnd, "Run out to the end of St Kilda Pier.", { r: 9, foot: true }),
      {
        enter: (s, r) => {
          r.text = "Get in the speedboat.";
        },
        tick: (s, r) => {
          const b = taggedCar(s, r, "boat");
          if (!b) return "The boat was lost.";
          r.goal = { x: b.x, z: b.z, r: 3 };
          if (playerCar(s) === b) return "next";
        },
      },
      act((s, r) => {
        const c = spawnCar(s, r, "courier", "speedboat", P.courierAt.x, P.courierAt.z, 2.4, "#1f66d6");
        const d = spawnPed(s, r, "courierman", c.x, c.z, { weapon: "smg", hostile: true });
        seat(s, d, c, 0);
        setCarGoto(c, s, P.courier, 22);
      }),
      stopCar("courier", "Catch the courier's boat and stop it (shoot it up).", { stopAt: 0.45, far: 320 }),
      act((s, r) => {
        const c = taggedCar(s, r, "courier")!;
        s.pickups.push({ id: s.nextId++, kind: "package", x: c.x + 3, z: c.z, n: 1, respawn: 0, takenAt: -1 });
        r.n = s.pickups[s.pickups.length - 1].id;
      }),
      {
        enter: (s, r) => {
          r.text = "Grab the package out of the water.";
        },
        tick: (s, r) => {
          const k = s.pickups.find((p) => p.id === r.n);
          const pos = playerPos(s);
          if (!k) return "next";
          r.goal = { x: k.x, z: k.z, r: 0 };
          if (Math.hypot(k.x - pos.x, k.z - pos.z) < 5) {
            s.pickups = s.pickups.filter((p) => p.id !== r.n);
            emit(s, { kind: "pickup", text: "Package" });
            return "next";
          }
        },
      },
      goTo(P.stationEnd, "Bring it to the end of Station Pier.", { r: 20 }),
      lose(),
    ],
  },
  {
    id: "boxjob",
    name: "Box Job",
    lead: "dex",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "The Dock Rats keep a van of knocked-off electronics in an Appleton Dock yard. Dex knows the yard.",
    pay: 5000,
    steps: [
      talk([
        ["Dex", "The Dock Rats use yard nine to stash what they lift off the boats. I used to load those vans."],
        ["Dex", "Take the van, bring it to the lock-up in Kensington. Ricky's got a buyer."],
      ]),
      act((s, r) => {
        spawnCar(s, r, "van", "cargo", P.yard.x, P.yard.z, 0, "#e8e8e6");
        const spots = [[-10, -10], [12, 12], [-20, 15], [20, -15], [-4, 30]].map(([dx, dz]) => [P.yard.x + dx, P.yard.z + dz]);
        spots.forEach(([x, z], i) => spawnPed(s, r, "rat", x, z, { weapon: i % 2 ? "smg" : "pistol", shirt: "#f28a1a", pants: "#2b3a55", hostile: false, mode: "guard", role: "gang" }));
      }),
      goTo(P.yard, "Go to yard nine at Appleton Dock.", { r: 25 }),
      {
        enter: (s, r) => {
          r.text = "Take the van (the Dock Rats will shoot).";
          for (const p of s.peds) if (p.tag === `${r.id}:rat`) {
            p.hostile = true;
          }
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "van");
          if (!c || c.wrecked) return "The van was destroyed.";
          r.goal = { x: c.x, z: c.z, r: 3 };
          if (playerCar(s) === c) return "next";
        },
      },
      wantedStep(2),
      goTo(P.lockup, "Drive the van to the lock-up on Epsom Rd, Kensington. Lose the cops on the way.", { tag: "van", r: 14, stop: true }),
      lose(),
    ],
  },
  {
    id: "pier",
    name: "Pier Pressure",
    lead: "nina",
    from: "Ricky",
    x: 0,
    z: 0,
    blurb: "Ricky's buyer wants to meet on St Kilda Pier at dusk. Bring Dex. Bring guns.",
    pay: 4000,
    steps: [
      partnerJoin("smg"),
      talk([
        ["Dex", "I don't like piers. One way on, one way off."],
        ["Nina", "That's why you're here."],
      ]),
      goTo(P.stkMid, "Walk out along St Kilda Pier to meet the buyer.", { r: 8 }),
      act((s, r) => {
        for (let i = 0; i < 7; i++) spawnPed(s, r, "crew", P.pierOut[i].x + (i % 2 ? 1.5 : -1.5), P.pierOut[i].z, { weapon: i % 3 === 0 ? "shotgun" : "smg", shirt: "#d81e2b", pants: "#e8dcc0", hostile: true, mode: "fight", role: "gang" }).ai.target = s.player;
      }),
      talk([
        ["Dex", "That's no buyer. That's the Esplanade boys!"],
        ["Nina", "Get down!"],
      ], 1.6),
      killAll("crew", "Take out the Esplanade crew."),
      wantedStep(2),
      lose("Get off the pier and lose the cops."),
    ],
  },
  {
    id: "casing",
    name: "Casing the Joint",
    lead: "nina",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "Dex has a big idea: the Southern Cross Reserve Bank on Collins St. First, look the place over.",
    pay: 1000,
    steps: [
      talk([
        ["Dex", "Vince is never letting us go. One job, Nina. One big one, and we're out."],
        ["Nina", "The Reserve Bank on Collins St? You're off your head."],
        ["Dex", "Just look at it. Front doors, the laneway out the back, the side on William St. Take photos."],
      ]),
      ...(
        [
          ["bank", "the front doors on Collins St"],
          [P.bankBack, "the back, on Flinders Lane"],
          [P.bankSide, "the side, on William St"],
        ] as [Spot, string][]
      ).flatMap(([where, what]): Step[] => [
        goTo(where, `Photograph ${what} (stand on the marker, on foot).`, { r: 3, foot: true }),
        wait(1.5, "Click..."),
        act((s) => emit(s, { kind: "toast", text: "Photo taken" })),
      ]),
      talk([["Nina", "OK. It's not impossible. I hate that it's not impossible."]]),
    ],
  },
  {
    id: "gearup",
    name: "Gear Up",
    lead: "dex",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "A getaway car nobody's looking for, and something heavier than a pistol.",
    pay: 2000,
    steps: [
      act((s, r) => {
        spawnCar(s, r, "trek", "trek", P.trek.x, P.trek.z, P.trek.h, "#1c1f24");
      }),
      goToPoi("gun-rich", "Go to Bullseye Arms in Richmond.", 6, true),
      act((s) => {
        const p = player(s);
        if (p.ammo.rifle === undefined) {
          p.ammo.rifle = 120;
          emit(s, { kind: "pickup", text: "Carbine Rifle" });
        }
        p.armor = 100;
        toast(s, "Ricky's mate left you a rifle and a vest.");
      }),
      {
        enter: (s, r) => {
          r.text = "Pinch the black Halvor Trek parked on Gipps St.";
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "trek");
          if (!c || c.wrecked) return "The Trek was destroyed.";
          r.goal = { x: c.x, z: c.z, r: 3 };
          if (playerCar(s) === c) return "next";
        },
      },
      {
        enter: (s, r) => {
          const ch = poi(s.city, "chop");
          r.text = "Stash it at Dockside Motors (lose any cops first).";
          r.goal = { x: ch.x, z: ch.z, r: 8 };
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "trek");
          if (!c || c.wrecked) return "The Trek was destroyed.";
          const ch = poi(s.city, "chop");
          if (playerCar(s) !== c) {
            r.text = "Get back in the Trek.";
            return;
          }
          r.text = "Stash it at Dockside Motors (lose any cops first).";
          if (Math.hypot(c.x - ch.x, c.z - ch.z) < 8 && speedOf(c) < 2) return "next";
        },
      },
      lose(),
    ],
  },
  {
    id: "armored",
    name: "Armoured Car",
    lead: "nina",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "An Ironside van runs the casino's takings into Collins St every afternoon. Stop it.",
    pay: 15000,
    steps: [
      partnerJoin("rifle"),
      talk([
        ["Dex", "Ironside van leaves South Melbourne every arvo. Two guards, one driver."],
        ["Nina", "We stop it, we grab the cases, we're gone before the cops finish their dim sims."],
      ]),
      act((s, r) => {
        const c = spawnCar(s, r, "armored", "armored", P.armStart.x, P.armStart.z, P.armStart.h, "#3d4a3f");
        const d = spawnPed(s, r, "guard", c.x, c.z, { weapon: "pistol", shirt: "#3d4a3f", pants: "#2b2f36", hp: 140 });
        seat(s, d, c, 0);
        const g = spawnPed(s, r, "guard", c.x, c.z, { weapon: "smg", shirt: "#3d4a3f", pants: "#2b2f36", hp: 140 });
        seat(s, g, c, 1);
        setCarGoto(c, s, roadPath(s, [P.armStart, P.bankRoad]), 13);
      }),
      stopCar("armored", "Stop the armoured van (ram it, shoot it) before it reaches the bank.", { stopAt: 0.35, far: 300 }),
      act((s, r) => {
        const c = taggedCar(s, r, "armored");
        if (!c) return;
        for (const id of [...c.seats]) {
          const p = pedById(s, id);
          if (p) {
            leave(s, p);
            p.hostile = true;
            p.ai.mode = "fight";
            p.ai.target = s.player;
          }
        }
        raise(s, 3, c.x, c.z);
      }),
      killAll("guard", "Deal with the guards."),
      act((s, r) => {
        const c = taggedCar(s, r, "armored");
        const x = c ? c.x : playerPos(s).x;
        const z = c ? c.z : playerPos(s).z;
        for (let i = 0; i < 3; i++) s.pickups.push({ id: s.nextId++, kind: "cash", x: x - 3 + i * 1.5, z: z + 2.5, n: 1500, respawn: 0, takenAt: -1 });
      }),
      wait(4, "Grab the cash cases!"),
      lose("Get away and lose the cops."),
    ],
  },
  {
    id: "double",
    name: "Double Cross",
    lead: "dex",
    from: "Vince Kostas",
    x: 0,
    z: 0,
    blurb: "Vince found out about the bank. Vince wants a cut. Vince sent friends.",
    pay: 6000,
    steps: [
      talk([
        ["Vince", "Dex. Mate. You're planning a party on Collins St and you didn't invite me?"],
        ["Vince", "Have a look out the window."],
      ]),
      act((s, r) => {
        const home = poi(s.city, "safe-dex");
        for (let i = 0; i < 6; i++) spawnPed(s, r, "goon", home.x + 18 + (i % 3) * 5, home.z - 14 + Math.floor(i / 3) * 26, { weapon: i % 2 ? "smg" : "shotgun", shirt: SAL, pants: "#2b2f36", hostile: true, mode: "fight", role: "gang" }).ai.target = s.player;
      }),
      killAll("goon", "Fight off Vince's blokes."),
      act((s, r) => {
        const c = spawnCar(s, r, "sal", "vanta", P.salStart.x, P.salStart.z, P.salStart.h, "#e8e8e6");
        const d = spawnPed(s, r, "salman", c.x, c.z, { weapon: "pistol", shirt: SAL, pants: "#e8dcc0", hp: 160 });
        seat(s, d, c, 0);
        setCarGoto(c, s, roadPath(s, [P.salStart, ...P.salRun]), 28);
      }),
      talk([["Dex", "That's Vince's car! He's doing a runner!"]], 1.5),
      stopCar("sal", "Chase down Vince's white Vanta GT and stop him.", { stopAt: 0.25, far: 360 }),
      act((s, r) => {
        const c = taggedCar(s, r, "sal");
        const d = taggedPed(s, r, "salman");
        if (c && d && d.car >= 0) leave(s, d);
        if (d) {
          d.hostile = true;
          d.ai.mode = "fight";
          d.ai.target = s.player;
        }
      }),
      killAll("salman", "Settle it with Vince."),
      lose(),
    ],
  },
  {
    id: "bigone",
    name: "The Big One",
    lead: "nina",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "The Southern Cross Reserve Bank. The vault. Then down the Yarra and out to the bay.",
    pay: 250000,
    steps: [
      partnerJoin("rifle"),
      talk([
        ["Dex", "Last time, Nina. Then it's a boat down the Yarra, out through the Heads, and a long way north."],
        ["Nina", "Masks on."],
      ]),
      goTo("bank", "Go into the Reserve Bank (front doors on Collins St, on foot).", { r: 3, foot: true }),
      act((s, r) => {
        const b = bankDoor(s);
        raise(s, 3, b.x, b.z);
        r.timer = 0;
        for (let i = 0; i < 4; i++) spawnPed(s, r, "secur", b.x + b.fx * 3 + b.tx * (i - 1.5) * 9, b.z + b.fz * 3 + b.tz * (i - 1.5) * 9, { weapon: "pistol", shirt: "#3d4a3f", pants: "#2b2f36", hostile: true, mode: "fight", hp: 120 }).ai.target = s.player;
      }),
      {
        enter: (s, r) => {
          r.text = "Hold the vault while Dex drills it.";
          const b = bankDoor(s);
          r.goal = { x: b.x, z: b.z, r: 12 };
          r.timer = 45;
        },
        tick: (s, r, dt) => {
          const pos = playerPos(s);
          const b = bankDoor(s);
          if (Math.hypot(pos.x - b.x, pos.z - b.z) > 40) {
            r.text = "Get back to the bank!";
            return;
          }
          r.timer -= dt;
          r.text = `Hold the bank while Dex drills the vault: ${Math.ceil(r.timer)} s`;
          if (r.timer < 22) raise(s, 4, b.x, b.z);
          if (r.timer <= 0) return "next";
        },
      },
      act((s, r) => {
        const b = bankDoor(s);
        for (let i = 0; i < 4; i++) s.pickups.push({ id: s.nextId++, kind: "cash", x: b.x + b.fx * 1.5 + b.tx * (i - 1.5) * 1.6, z: b.z + b.fz * 1.5 + b.tz * (i - 1.5) * 1.6, n: 2500, respawn: 0, takenAt: -1 });
        spawnCar(s, r, "getaway", "furia", P.getaway.x, P.getaway.z, P.getaway.h, "#141518");
        spawnCar(s, r, "yacht", "speedboat", P.yacht.x, P.yacht.z, Math.PI / 2, "#e8e8e6");
      }),
      talk([["Dex", "We're in! Grab the bags, the car's out the front!"]], 2),
      wantedStep(5),
      goTo("marina", "Get to the jetty at Docklands Marina.", { r: 16 }),
      {
        enter: (s, r) => {
          r.text = "Get in the speedboat.";
        },
        tick: (s, r) => {
          const b = taggedCar(s, r, "yacht");
          if (!b || b.wrecked) return "The boat was destroyed.";
          r.goal = { x: b.x, z: b.z, r: 3 };
          if (playerCar(s) === b) return "next";
        },
      },
      goTo(P.yarraMouth, "Run down the Yarra past the docks, for the West Gate and the bay.", { tag: "yacht", r: 70 }),
      act((s) => {
        const w = s.wanted;
        w.level = 0;
        w.pending = 0;
        emit(s, { kind: "lost", n: 5 });
      }),
      talk([
        ["Nina", "Can you see them?"],
        ["Dex", "I can see the bay. A lot of bay. We did it."],
        ["Nina", "We did it."],
      ]),
    ],
  },
];

/** Who's speaking each story mission's first lines (and where they start). */
const STARTS: Record<string, { x: number; z: number } | string> = {
  sunburn: "safe-nina",
  change: "safe-dex",
  wheels: "chop",
  collect: { x: P.vince.x, z: P.vince.z - 8 },
  lowtide: "chop",
  boxjob: "safe-dex",
  pier: "safe-nina",
  casing: "bank",
  gearup: "safe-dex",
  armored: "safe-nina",
  double: "safe-dex",
  bigone: "safe-nina",
};

export function missionStart(s: State, m: MissionDef) {
  const st = STARTS[m.id];
  if (typeof st === "string") {
    const p = poi(s.city, st);
    // A few steps along the sidewalk from the door.
    return { x: p.x + p.fz * 6, z: p.z - p.fx * 6 };
  }
  return st;
}

/** The story missions you could start now (as this lead). */
export function available(s: State) {
  if (s.story.run) return [];
  const next = STORY.find((m) => !s.story.done.includes(m.id));
  return next ? [next] : [];
}

export function nextStory(s: State) {
  return STORY.find((m) => !s.story.done.includes(m.id)) ?? null;
}

export function startMission(s: State, id: string) {
  const m = STORY.find((x) => x.id === id) ?? SIDE.find((x) => x.id === id);
  if (!m || s.story.run) return false;
  s.story.run = { id, step: -1, t: 0, total: 0, peds: [], cars: [], n: 0, text: "", goal: null, failed: "", timer: 0, pay: 0 };
  emit(s, { kind: "mission", text: m.name });
  advance(s, m);
  return true;
}

function advance(s: State, m: MissionDef) {
  const r = s.story.run!;
  r.step++;
  r.t = 0;
  if (r.step >= m.steps.length) {
    pass(s, m);
    return;
  }
  const st = m.steps[r.step];
  st.enter?.(s, r);
}

function pass(s: State, m: MissionDef) {
  const r = s.story.run!;
  const pay = (m.pay || 0) + r.pay;
  cleanup(s, r);
  s.story.run = null;
  if (STORY.includes(m)) {
    if (!s.story.done.includes(m.id)) s.story.done.push(m.id);
  }
  if (pay > 0) earn(s, pay, m.name);
  emit(s, { kind: "pass", text: m.name, n: pay });
  const nx = nextStory(s);
  if (nx && STORY.includes(m)) emit(s, { kind: "unlock", text: nx.lead !== m.lead ? `${LEADS[nx.lead].name}'s next: ${nx.name}` : `Next: ${nx.name}` });
}

export function failMission(s: State, why: string) {
  const r = s.story.run;
  if (!r) return;
  const m = STORY.find((x) => x.id === r.id) ?? SIDE.find((x) => x.id === r.id);
  cleanup(s, r);
  s.story.run = null;
  emit(s, { kind: "fail", text: why, who: m?.name });
}

function cleanup(s: State, r: MissionRun) {
  const pre = `${r.id}:`;
  for (const p of s.peds) {
    if (!p.tag.startsWith(pre)) continue;
    if (p.role === "partner") {
      if (p.car >= 0) leave(s, p);
      p.tag = "__gone";
      continue;
    }
    p.tag = "";
    if (p.role === "mission") p.role = "civ";
  }
  s.peds = s.peds.filter((p) => p.tag !== "__gone");
  for (const c of s.cars) if (c.tag.startsWith(pre)) c.tag = "";
}

export function stepMissions(s: State, dt: number) {
  const r = s.story.run;
  sideJobs(s, dt);
  if (!r) {
    // Walking (or driving) into a mission's marker starts it.
    if (s.down || s.wanted.level > 0) return;
    const pos = playerPos(s);
    let near = false;
    for (const m of available(s)) {
      if (m.lead !== s.chars[s.active].id) continue;
      const st = missionStart(s, m);
      const d = Math.hypot(pos.x - st.x, pos.z - st.z);
      if (d < 7) near = true;
      if (d < 3.2 && s.armed) {
        s.armed = false;
        startMission(s, m.id);
      }
    }
    if (!near) s.armed = true;
    return;
  }
  const m = STORY.find((x) => x.id === r.id) ?? SIDE.find((x) => x.id === r.id);
  if (!m) {
    s.story.run = null;
    return;
  }
  r.t += dt;
  r.total += dt;
  const pf = partnerTick(s, r);
  if (pf) {
    failMission(s, pf);
    return;
  }
  const res = m.steps[r.step]?.tick(s, r, dt);
  if (res === "next") advance(s, m);
  else if (typeof res === "string" && res) failMission(s, res);
}

/* ------------------------------------------------------------------ side jobs */

export interface Race {
  id: string;
  name: string;
  car: VehicleKind;
  prize: number;
  pts: { x: number; z: number }[];
}

const pts = (...xz: number[]) => Array.from({ length: xz.length / 2 }, (_, i) => ({ x: xz[i * 2], z: xz[i * 2 + 1] }));

/** The races, checkpoint by checkpoint on the real roads. */
export const RACES: Race[] = [
  { id: "race-hoddle", name: "Hoddle Grid Hustle", car: "vanta", prize: 1500, pts: pts(678.5, -271.5, -205, 37, -1077.5, 357, -1378, -517.5, -945, -669, 510, -714.5, 588, -499) },
  { id: "race-beachrd", name: "Beach Road Run", car: "stallion", prize: 2000, pts: pts(-2547.5, 2816, -1392.5, 3489, -360.5, 4111, 562.5, 4909, 738, 5663, 837.5, 6240.5) },
  { id: "race-docks", name: "Dockyard Dash", car: "ranger", prize: 2500, pts: pts(-1729, 353.5, -1923, -239, -2142, -560.5, -2941, -921, -3351.5, -999, -2644.5, -887.5, -1798.5, 119.5) },
  { id: "race-lake", name: "Albert Park Grand Prix", car: "furia", prize: 4000, pts: pts(-327.5, 2369.5, -358.5, 2879, -3.5, 3423.5, 585, 3826.5, 1012, 4080, 906.5, 3597, 539.5, 3362.5, 299.5, 3000, 400.5, 2638.5, 232, 2310.5, -327.5, 2369.5) },
];

/** Hidden sun tokens: 20 of them, $250 each, a bonus for the set. */
export const TOKENS: { x: number; z: number }[] = pts(
  -470, 4800, 158, 11, 597.5, 78, 1080.5, -478, 773, -389, 290, -1367.5, 1124.5, 1356.5, 465.5, 1245.5, -367, 2854.5, 641, 5415,
  -893.5, -1219, -1115.5, -811.5, -498.5, -2272, 1651.5, -89, 2601, 852.5, -2672.5, 2793, -920, 1667, -2345.5, -255.5, -3706.5, 1246.5, 2497.5, 2440.5,
);

export const SIDE: MissionDef[] = RACES.map((race) => ({
  id: race.id,
  name: race.name,
  lead: "nina",
  from: "Street racing",
  x: race.pts[0].x,
  z: race.pts[0].z,
  blurb: `A street race: ${race.pts.length - 1} checkpoints against three rivals. First across the line wins $${race.prize}.`,
  pay: 0,
  steps: raceSteps(race),
}));

function raceSteps(race: Race): Step[] {
  return [
    act((s, r) => {
      const a = race.pts[0];
      const b = race.pts[1];
      const h = Math.atan2(b.z - a.z, b.x - a.x);
      const fx = Math.cos(h);
      const fz = Math.sin(h);
      const pc = playerCar(s);
      // Move everything off the grid; line up four cars.
      if (pc) {
        pc.x = a.x;
        pc.z = a.z;
        pc.h = h;
        pc.vx = pc.vz = 0;
      }
      for (let i = 0; i < 3; i++) {
        const c = spawnCar(s, r, `rival${i}`, race.car === "ranger" ? "ranger" : s.rng.pick(["vanta", "stallion", "furia"] as VehicleKind[]), a.x - fx * (6 + i * 7) + -fz * (i % 2 ? 3 : -3), a.z - fz * (6 + i * 7) + fx * (i % 2 ? 3 : -3), h);
        const d = spawnPed(s, r, `racer${i}`, c.x, c.z, { role: "mission" });
        seat(s, d, c, 0);
        c.ai.mode = "idle";
      }
      r.n = 1;
      r.timer = 3.5;
      r.text = "Get ready...";
    }),
    {
      tick: (s, r, dt) => {
        r.timer -= dt;
        r.text = r.timer > 0.5 ? `${Math.ceil(r.timer - 0.5)}...` : "GO!";
        const pc = playerCar(s);
        if (pc && r.timer > 0.5) {
          pc.vx *= 0.5;
          pc.vz *= 0.5;
        }
        if (r.timer > 0) return;
        for (let i = 0; i < 3; i++) {
          const c = taggedCar(s, r, `rival${i}`);
          if (c) setCarGoto(c, s, roadPath(s, race.pts), 30 + i * 2.5);
        }
        return "next";
      },
    },
    {
      enter: (s, r) => {
        r.n = 1;
      },
      tick: (s, r) => {
        const pc = playerCar(s);
        if (!pc) return "You left your car.";
        const cp = race.pts[r.n];
        r.goal = { x: cp.x, z: cp.z, r: 9 };
        // Your place: by checkpoint, then distance.
        let place = 1;
        for (let i = 0; i < 3; i++) {
          const c = taggedCar(s, r, `rival${i}`);
          if (!c || c.wrecked) continue;
          const progress = c.ai.pi / Math.max(1, c.ai.path.length);
          const mine = (r.n - 1) / (race.pts.length - 1);
          if (progress > mine + 0.02) place++;
          if (c.ai.pi >= c.ai.path.length - 1 && Math.hypot(c.x - race.pts[race.pts.length - 1].x, c.z - race.pts[race.pts.length - 1].z) < 12) return `You lost the race.`;
        }
        r.text = `Checkpoint ${r.n} of ${race.pts.length - 1} · ${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
        if (Math.hypot(pc.x - cp.x, pc.z - cp.z) < 10) {
          r.n++;
          emit(s, { kind: "toast", text: "" });
          if (r.n >= race.pts.length) {
            r.pay = race.prize;
            s.story.races[race.id] = (s.story.races[race.id] ?? 0) + 1;
            s.stats.races++;
            return "next";
          }
        }
      },
    },
  ];
}

let sideT = 0;

function sideJobs(s: State, dt: number) {
  sideT -= dt;
  if (sideT > 0) return;
  sideT = 0.25;
  const pl = player(s);
  if (!pl) return;
  // The chop shop's car of the day.
  if (s.story.exportDay !== s.day) {
    s.story.exportDay = s.day;
    const opts: VehicleKind[] = ["vanta", "stallion", "furia", "trek", "ranger", "brisa", "aria", "bike", "cargo"];
    s.story.exportCar = opts[(s.day * 7 + 3) % opts.length];
  }
  const pos = playerPos(s);
  const pc = playerCar(s);
  if (!s.story.run && pc && s.story.done.includes("wheels")) {
    const ch = poi(s.city, "chop");
    if (Math.hypot(pc.x - ch.x, pc.z - ch.z) < 8 && speedOf(pc) < 2 && pc.kind === s.story.exportCar && !pc.own && s.wanted.level === 0) {
      const pay = Math.round(VEHICLES[pc.kind].value * Math.max(0.3, pc.hp / VEHICLES[pc.kind].hp));
      leave(s, pl);
      pc.tag = "";
      pc.ai.mode = "parked";
      pc.kind = pc.kind;
      s.story.exportsDone.push(`${s.day}:${pc.kind}`);
      s.stats.exports++;
      earn(s, pay, `Export: ${VEHICLES[pc.kind].name}`);
      s.story.exportDay = -1;
      // It's gone into the back.
      s.cars = s.cars.filter((c) => c !== pc);
    }
  }
  // Hold-ups at any milk bar (once every ten minutes each).
  if (!s.story.run && !pc) {
    for (const st of s.city.pois) {
      if (st.kind !== "store") continue;
      if (Math.hypot(pos.x - st.x, pos.z - st.z) > 3) continue;
      const last = s.story.robbed[st.id] ?? -1e9;
      if (s.t - last < 600) continue;
      if (pl.aiming && !WEAPONS[pl.weapon].melee) {
        pl.ai.timer += 0.25;
        if (pl.ai.timer >= 5) {
          pl.ai.timer = 0;
          const n = s.rng.int(350, 950);
          s.story.robbed[st.id] = s.t;
          s.stats.stores++;
          earn(s, n, `Hold-up: ${st.name}`);
          crime(s, "robbery", st.x, st.z);
        }
      } else pl.ai.timer = 0;
    }
  }
  // Races: drive into the start in any car.
  if (!s.story.run && pc && s.wanted.level === 0) {
    for (const race of RACES) {
      const a = race.pts[0];
      if (Math.hypot(pc.x - a.x, pc.z - a.z) < 6 && speedOf(pc) < 3) startMission(s, race.id);
    }
  }
  // Sun tokens.
  for (let i = 0; i < TOKENS.length; i++) {
    if (s.story.tokens.includes(i)) continue;
    const t = TOKENS[i];
    if (Math.hypot(pos.x - t.x, pos.z - t.z) < 2.4 && (groundY(t.x, t.z) > WATER_Y || pc)) {
      s.story.tokens.push(i);
      earn(s, 250, "Sun token");
      emit(s, { kind: "pickup", text: `Sun token ${s.story.tokens.length}/${TOKENS.length}` });
      if (s.story.tokens.length === TOKENS.length) earn(s, 5000, "Every sun token");
    }
  }
}

/** Score from the story and side jobs. */
export function missionScore(s: State) {
  return s.story.done.length * 5000 + Object.values(s.story.races).reduce((a, n) => a + n * 1200, 0) + s.story.exportsDone.length * 600 + s.story.tokens.length * 300 + s.stats.stores * 200;
}

export function missionDef(id: string) {
  return STORY.find((x) => x.id === id) ?? SIDE.find((x) => x.id === id) ?? null;
}

export { damage, fire, aimAt, startReload, carById };
