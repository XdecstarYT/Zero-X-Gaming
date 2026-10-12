import { LEADS, OUTFITS, VEHICLES, WEAPONS, type CharId, type VehicleKind, type WeaponId } from "./data";
import { aimAt, damage, fire, startReload } from "./combat";
import { crime, raise } from "./police";
import { carById, earn, emit, leadLook, makeCar, makePed, pedById, player, playerCar, playerPos, poi, speedOf, toast, type Car, type MissionRun, type Ped, type State } from "./state";
import { randomLook } from "./traffic";
import { leave, seat } from "./vehicles";
import { groundY, route, WATER_Y } from "./world";

/**
 * The story of Nina Cruz and Dex Holloway, twelve missions long, and the side jobs: store
 * hold-ups, street races, cars for the chop shop and the hidden sun tokens.
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

function goTo(x: number, z: number, text: string, o: { r?: number; car?: boolean; foot?: boolean; tag?: string; stop?: boolean } = {}): Step {
  return {
    enter: (s, r) => {
      r.text = text;
      r.goal = { x, z, r: o.r ?? 5 };
    },
    tick: (s, r) => {
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

/* ------------------------------------------------------------------ the story */

const SAL = "#c9853a";

export const STORY: MissionDef[] = [
  {
    id: "sunburn",
    name: "Sunburn",
    lead: "nina",
    from: "Nina",
    x: 0,
    z: 0,
    blurb: "Dex has walked off his last shift at the Harbor. Pick him up before he does something stupid.",
    pay: 500,
    steps: [
      talk([
        ["Dex", "Nina? It's me. They let me go. Twelve years, and they let me go."],
        ["Nina", "Where are you?"],
        ["Dex", "Outside the gate at the Harbor. Come get me before I put the foreman in the water."],
      ]),
      {
        enter: (s, r) => {
          r.text = "Get in your car (the red Stallion outside).";
          const c = s.cars.find((x) => x.tag === "ride-nina" && !x.wrecked);
          r.goal = c ? { x: c.x, z: c.z, r: 3 } : null;
        },
        tick: (s) => (playerCar(s) ? "next" : undefined),
      },
      goTo(40, 518, "Drive to the Harbor gate on Cargo Way.", { car: true, r: 9 }),
      partnerJoin("fists"),
      talk([
        ["Dex", "Twelve years. You know what I've got to show for it? A bad back and a loan from Sal Moreno."],
        ["Nina", "Sal Moreno? Dex..."],
        ["Dex", "Take me home. I need to think."],
      ]),
      goTo(-790, -78, "Take Dex home to his trailer in the Glades.", { car: true, r: 10, stop: true }),
      talk([
        ["Nina", "Get some sleep. Call me tomorrow."],
        ["Dex", "I've got an idea, Nina. You won't like it."],
      ]),
    ],
  },
  {
    id: "change",
    name: "Loose Change",
    lead: "dex",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "Sal wants his first payment. Dex knows a Quik Stop in Palm Heights with a fat till.",
    pay: 0,
    steps: [
      talk([
        ["Dex", "Sal wants a payment by Friday. I've got eleven dollars."],
        ["Dex", "There's a pistol in the drawer. And a Quik Stop on Hibiscus with no camera."],
      ]),
      act((s) => {
        const p = player(s);
        if (p.ammo.pistol === undefined) {
          p.ammo.pistol = 36;
          emit(s, { kind: "pickup", text: "Pistol" });
        }
      }),
      goTo(-466, 80, "Drive to the Quik Stop in Palm Heights.", { r: 12 }),
      holdUp("store-3", [1200, 1800]),
      lose("The alarm's gone. Lose the police."),
      goTo(-790, -78, "Lie low back at the trailer.", { r: 10 }),
    ],
  },
  {
    id: "wheels",
    name: "Hot Wheels",
    lead: "nina",
    from: "Rico at Dockside Motors",
    x: 0,
    z: 0,
    blurb: "Dockside Motors will pay well for a Furia RS. There's one in a driveway on Marina Keys.",
    pay: 6000,
    steps: [
      talk([
        ["Rico", "You're Nina? Dex says you can drive. I need a Furia RS, and I need it clean."],
        ["Rico", "Villa Esmeralda on the Keys. Owner's away; his security isn't."],
      ]),
      act((s, r) => {
        const v = poi(s.city, "mansion");
        spawnCar(s, r, "furia", "furia", v.x - v.fx * 2 + 8, v.z - 9, Math.PI / 2, "#3fd0c9");
        for (let i = 0; i < 2; i++) spawnPed(s, r, "guard", v.x - 6 + i * 12, v.z - 4, { weapon: "pistol", shirt: "#1c1f24", pants: "#1c1f24", hostile: false, mode: "guard" });
      }),
      goTo(1000, 330, "Drive over the Causeway to Marina Keys.", { r: 30 }),
      {
        enter: (s, r) => {
          r.text = "Take the Furia RS (the guards will fight for it).";
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "furia");
          if (!c || c.wrecked) return "The Furia was destroyed.";
          r.goal = { x: c.x, z: c.z, r: 3 };
          // The guards don't like visitors near the car.
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
              r.text = "Lose the police first: Rico won't open up with cops on you.";
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
      talk([["Rico", "Beautiful. Come back any time: there's a car I want every day. Check the board."]]),
    ],
  },
  {
    id: "collect",
    name: "Collections",
    lead: "dex",
    from: "Sal Moreno",
    x: 0,
    z: 0,
    blurb: "Sal will take the debt in work instead: collect from three people who owe him.",
    pay: 2500,
    steps: [
      talk([
        ["Sal", "Dex. You're short. But you've got big hands, and three of my friends have short memories."],
        ["Sal", "Remind them. Bring me what they owe. Don't kill anybody: dead men don't pay."],
      ]),
      act((s, r) => {
        r.n = 0;
        const spots = [
          [-354, 180],
          [246, 280],
          [-66, -20],
        ];
        spots.forEach(([x, z], i) => spawnPed(s, r, `debtor${i}`, x, z, { weapon: i === 1 ? "bat" : "fists", mode: "idle", hp: 70 }));
      }),
      ...[0, 1, 2].flatMap((i): Step[] => [
        {
          enter: (s, r) => {
            r.text = `Collect from debtor ${i + 1} of 3: knock them down.`;
          },
          tick: (s, r) => {
            const d = taggedPed(s, r, `debtor${i}`);
            if (!d) return "A debtor got away.";
            r.goal = { x: d.x, z: d.z, r: 0 };
            if (d.state === "dead") return "Sal said don't kill anybody.";
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
      goTo(145, 60, "Bring the money to Sal at Café Brisa on Marlin St.", { r: 4, foot: true }),
      talk([["Sal", "See? Everybody's happy. Keep a little for yourself. I'll be in touch."]]),
    ],
  },
  {
    id: "lowtide",
    name: "Low Tide",
    lead: "nina",
    from: "Rico at Dockside Motors",
    x: 0,
    z: 0,
    blurb: "A courier's taking a package out by boat. Rico wants it. Boats are waiting at Solano Pier.",
    pay: 3500,
    steps: [
      talk([
        ["Rico", "A courier runs a package from the river mouth out to the Keys every Tuesday. Today's Tuesday."],
        ["Rico", "There's a speedboat at the end of Solano Pier. The keys are in it. Don't ask."],
      ]),
      act((s, r) => {
        spawnCar(s, r, "boat", "speedboat", 792, -218, 0, "#e8e8e6");
      }),
      goTo(770, -205, "Run to the end of Solano Pier.", { r: 8, foot: true }),
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
        const c = spawnCar(s, r, "courier", "speedboat", 700, -150, 0, "#1f66d6");
        const d = spawnPed(s, r, "courierman", 700, -150, { weapon: "smg", hostile: true });
        seat(s, d, c, 0);
        setCarGoto(c, s, [{ x: 760, z: -40 }, { x: 830, z: 120 }, { x: 760, z: 260 }, { x: 720, z: 420 }, { x: 760, z: 600 }, { x: 900, z: 680 }, { x: 1100, z: 640 }], 22);
      }),
      stopCar("courier", "Catch the courier's boat and stop it (shoot it up).", { stopAt: 0.45, far: 320 }),
      act((s, r) => {
        const c = taggedCar(s, r, "courier")!;
        s.pickups.push({ id: s.nextId++, kind: "package", x: c.x + 3, z: c.z, n: 1, respawn: 0, takenAt: -1 });
        r.n = s.pickups[s.pickups.length - 1].id;
      }),
      {
        enter: (s, r) => {
          r.text = "Grab the package from the water.";
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
      goTo(785, 582, "Bring it to the Yacht Club jetty on Marina Keys.", { r: 14 }),
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
    blurb: "The Saltwater Kings keep a van of stolen electronics in a Harbor yard. Dex knows the yard.",
    pay: 5000,
    steps: [
      talk([
        ["Dex", "The Kings use yard nine to stash what they lift off the boats. I used to load those vans."],
        ["Dex", "Take the van, bring it to the Glades. Rico's got a buyer."],
      ]),
      act((s, r) => {
        spawnCar(s, r, "van", "cargo", 180, 470, 0, "#e8e8e6");
        const spots = [[170, 460], [192, 482], [160, 486], [200, 455], [176, 500]];
        spots.forEach(([x, z], i) => spawnPed(s, r, "king", x, z, { weapon: i % 2 ? "smg" : "pistol", shirt: "#1aa39a", pants: "#1c1f24", hostile: false, mode: "guard", role: "gang" }));
      }),
      goTo(180, 440, "Go to yard nine at the Harbor.", { r: 25 }),
      {
        enter: (s, r) => {
          r.text = "Take the van (the Kings will shoot).";
          for (const p of s.peds) if (p.tag === `${r.id}:king`) {
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
      goTo(-760, -40, "Drive the van to the Glades. Lose the police on the way.", { tag: "van", r: 12, stop: true }),
      lose(),
    ],
  },
  {
    id: "pier",
    name: "Pier Pressure",
    lead: "nina",
    from: "Rico",
    x: 0,
    z: 0,
    blurb: "Rico's buyer wants to meet on Solano Pier at dusk. Bring Dex. Bring guns.",
    pay: 4000,
    steps: [
      partnerJoin("smg"),
      talk([
        ["Dex", "I don't like piers. One way on, one way off."],
        ["Nina", "That's why you're here."],
      ]),
      goTo(640, -205, "Walk out onto Solano Pier to meet the buyer.", { r: 8 }),
      act((s, r) => {
        for (let i = 0; i < 7; i++) spawnPed(s, r, "crew", 700 + (i % 4) * 14, -205 + (i % 2 ? 4 : -4), { weapon: i % 3 === 0 ? "shotgun" : "smg", shirt: "#d81e2b", pants: "#1c1f24", hostile: true, mode: "fight", role: "gang" }).ai.target = s.player;
      }),
      talk([
        ["Dex", "That's not a buyer. That's the Sol crew!"],
        ["Nina", "Get down!"],
      ], 1.6),
      killAll("crew", "Take out the Sol crew."),
      wantedStep(2),
      lose("Get off the pier and lose the police."),
    ],
  },
  {
    id: "casing",
    name: "Casing the Joint",
    lead: "nina",
    from: "Dex",
    x: 0,
    z: 0,
    blurb: "Dex has a big idea: the Solano Union Bank. First, look the place over.",
    pay: 1000,
    steps: [
      talk([
        ["Dex", "Sal's never letting us go. One job, Nina. One big one, and we're out."],
        ["Nina", "The Union Bank? You're out of your mind."],
        ["Dex", "Just look at it. Front door, the alley, the loading bay. Take pictures."],
      ]),
      ...[
        [134, -392, "the front doors"],
        [158, -436, "the alley"],
        [104, -436, "the loading bay"],
      ].flatMap(([x, z, what]): Step[] => [
        goTo(x as number, z as number, `Photograph ${what} of the Union Bank (stand on the marker, on foot).`, { r: 3, foot: true }),
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
        spawnCar(s, r, "trek", "trek", -400, -385, Math.PI / 2, "#1c1f24");
      }),
      goTo(-560, -480, "Go to Bullseye Arms in Midtown.", { r: 6, foot: true }),
      act((s) => {
        const p = player(s);
        if (p.ammo.rifle === undefined) {
          p.ammo.rifle = 120;
          emit(s, { kind: "pickup", text: "Carbine Rifle" });
        }
        p.armor = 100;
        toast(s, "Rico's friend left you a rifle and armour.");
      }),
      {
        enter: (s, r) => {
          r.text = "Steal the black Halvor Trek parked on Royal Palm St.";
        },
        tick: (s, r) => {
          const c = taggedCar(s, r, "trek");
          if (!c || c.wrecked) return "The Trek was destroyed.";
          r.goal = { x: c.x, z: c.z, r: 3 };
          if (playerCar(s) === c) return "next";
        },
      },
      goTo(-40, 560, "Stash it at Dockside Motors (lose any police first).", { tag: "trek", r: 8, stop: true }),
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
    blurb: "A Securitas van runs Midtown's takings to the bank every afternoon. Stop it.",
    pay: 15000,
    steps: [
      partnerJoin("rifle"),
      talk([
        ["Dex", "Securitas van leaves Bayfront every afternoon. Two guards, one driver."],
        ["Nina", "We stop it, we take the cases, we're gone before the cops finish their donuts."],
      ]),
      act((s, r) => {
        const c = spawnCar(s, r, "armored", "armored", -560, -620, Math.PI / 2, "#3d4a3f");
        const d = spawnPed(s, r, "guard", c.x, c.z, { weapon: "pistol", shirt: "#3d4a3f", pants: "#2b2f36", hp: 140 });
        seat(s, d, c, 0);
        const g = spawnPed(s, r, "guard", c.x, c.z, { weapon: "smg", shirt: "#3d4a3f", pants: "#2b2f36", hp: 140 });
        seat(s, g, c, 1);
        setCarGoto(c, s, roadPath(s, [{ x: -560, z: -620 }, { x: -260, z: -240 }, { x: 40, z: -240 }, { x: 140, z: -400 }]), 13);
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
      lose("Get away and lose the police."),
    ],
  },
  {
    id: "double",
    name: "Double Cross",
    lead: "dex",
    from: "Sal Moreno",
    x: 0,
    z: 0,
    blurb: "Sal found out about the bank. Sal wants a cut. Sal sent friends.",
    pay: 6000,
    steps: [
      talk([
        ["Sal", "Dex. My friend. You're planning a party at the Union Bank and you didn't invite me?"],
        ["Sal", "Look out the window."],
      ]),
      act((s, r) => {
        const home = poi(s.city, "safe-dex");
        for (let i = 0; i < 6; i++) spawnPed(s, r, "goon", home.x + 18 + (i % 3) * 5, home.z - 14 + Math.floor(i / 3) * 26, { weapon: i % 2 ? "smg" : "shotgun", shirt: SAL, pants: "#2b2f36", hostile: true, mode: "fight", role: "gang" }).ai.target = s.player;
      }),
      killAll("goon", "Fight off Sal's men."),
      act((s, r) => {
        const c = spawnCar(s, r, "sal", "vanta", -660, -120, -Math.PI / 2, "#e8e8e6");
        const d = spawnPed(s, r, "salman", c.x, c.z, { weapon: "pistol", shirt: SAL, pants: "#e8dcc0", hp: 160 });
        seat(s, d, c, 0);
        setCarGoto(c, s, roadPath(s, [{ x: -660, z: -120 }, { x: -260, z: -70 }, { x: 40, z: 130 }, { x: 340, z: 330 }, { x: 930, z: 330 }]), 28);
      }),
      talk([["Dex", "That's Sal's car! He's running!"]], 1.5),
      stopCar("sal", "Chase down Sal's white Vanta GT and stop him.", { stopAt: 0.25, far: 360 }),
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
      killAll("salman", "Settle it with Sal."),
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
    blurb: "The Solano Union Bank. The vault. Then the sea.",
    pay: 250000,
    steps: [
      partnerJoin("rifle"),
      talk([
        ["Dex", "Last time, Nina. Then it's a boat, the Keys, and a long way south."],
        ["Nina", "Masks on."],
      ]),
      goTo(134, -392, "Go into the Solano Union Bank (front doors, on foot).", { r: 3, foot: true }),
      act((s, r) => {
        raise(s, 3, 134, -392);
        r.timer = 0;
        for (let i = 0; i < 4; i++) spawnPed(s, r, "secur", 120 + i * 9, -410, { weapon: "pistol", shirt: "#3d4a3f", pants: "#2b2f36", hostile: true, mode: "fight", hp: 120 }).ai.target = s.player;
      }),
      {
        enter: (s, r) => {
          r.text = "Hold the vault while Dex drills it.";
          r.goal = { x: 134, z: -392, r: 12 };
          r.timer = 45;
        },
        tick: (s, r, dt) => {
          const pos = playerPos(s);
          if (Math.hypot(pos.x - 134, pos.z + 392) > 40) {
            r.text = "Get back to the bank!";
            return;
          }
          r.timer -= dt;
          r.text = `Hold the bank while Dex drills the vault: ${Math.ceil(r.timer)} s`;
          if (r.timer < 22) raise(s, 4, 134, -392);
          if (r.timer <= 0) return "next";
        },
      },
      act((s, r) => {
        for (let i = 0; i < 4; i++) s.pickups.push({ id: s.nextId++, kind: "cash", x: 130 + i * 1.6, z: -390, n: 2500, respawn: 0, takenAt: -1 });
        spawnCar(s, r, "getaway", "furia", 160, -372, Math.PI, "#141518");
        spawnCar(s, r, "yacht", "speedboat", 790, 612, 0, "#e8e8e6");
      }),
      talk([["Dex", "We're in! Grab the bags, the car's out front!"]], 2),
      wantedStep(5),
      goTo(782, 585, "Get to the Yacht Club jetty on Marina Keys.", { r: 12 }),
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
      goTo(1180, 900, "Head out to sea, south-east, past the Keys.", { tag: "yacht", r: 40 }),
      act((s) => {
        const w = s.wanted;
        w.level = 0;
        w.pending = 0;
        emit(s, { kind: "lost", n: 5 });
      }),
      talk([
        ["Nina", "Do you see them?"],
        ["Dex", "I see sea. A lot of sea. We did it."],
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
  collect: { x: 145, z: 60 },
  lowtide: "chop",
  boxjob: "safe-dex",
  pier: "safe-nina",
  casing: { x: 120, z: -360 },
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

export const RACES: Race[] = [
  { id: "race-strand", name: "Strand Sprint", car: "vanta", prize: 1500, pts: [{ x: 450, z: -700 }, { x: 450, z: -240 }, { x: 340, z: -240 }, { x: 340, z: 130 }, { x: 450, z: 130 }, { x: 450, z: 560 }] },
  { id: "race-downtown", name: "Downtown Loop", car: "stallion", prize: 2000, pts: [{ x: -160, z: -650 }, { x: 240, z: -650 }, { x: 240, z: -340 }, { x: -60, z: -340 }, { x: -60, z: -540 }, { x: 140, z: -540 }, { x: 140, z: -240 }, { x: -160, z: -240 }] },
  { id: "race-glades", name: "Glades Run", car: "ranger", prize: 2500, pts: [{ x: -660, z: -650 }, { x: -660, z: 330 }, { x: -780, z: 330 }, { x: -780, z: -70 }, { x: -560, z: -70 }, { x: -560, z: 530 }] },
  { id: "race-causeway", name: "Causeway Dash", car: "furia", prize: 4000, pts: [{ x: -260, z: 330 }, { x: 450, z: 330 }, { x: 930, z: 330 }, { x: 930, z: 560 }, { x: 830, z: 560 }, { x: 830, z: 200 }, { x: 1030, z: 200 }] },
];

/** Hidden sun tokens: 20 of them, $250 each, a bonus for the set. */
export const TOKENS: { x: number; z: number }[] = [
  { x: 780, z: -205 }, { x: -880, z: -70 }, { x: 1080, z: 380 }, { x: -460, z: -545 }, { x: 60, z: 790 }, { x: 600, z: -700 }, { x: 560, z: 420 }, { x: -820, z: 600 }, { x: 300, z: -760 }, { x: -110, z: 80 },
  { x: 200, z: 600 }, { x: -620, z: 20 }, { x: 930, z: 230 }, { x: 140, z: -150 }, { x: -260, z: -700 }, { x: 395, z: -10 }, { x: -700, z: -560 }, { x: 0, z: 300 }, { x: 830, z: 470 }, { x: -380, z: 600 },
];

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
  // Hold-ups at any Quik Stop (once a day each).
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
