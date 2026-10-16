import { DOCK_TRAFFIC, LEADS, PAINT, RICH_TRAFFIC, TRAFFIC, VEHICLES, type VehicleKind } from "./data";
import { policeDrive } from "./police";
import { carById, clamp, fwdSpeed, makeCar, makePed, pedById, player, playerPos, speedOf, type Car, type Look, type State } from "./state";
import { NO_DRIVE, seat, type Drive } from "./vehicles";
import { districtAt, groundY, nearestRoad, onDeck, ROAD, WATER_Y, type Node, type Seg } from "./world";

/**
 * Traffic: drivers keep to their lane on the left (this is Melbourne), stop at red lights, keep their distance,
 * pick a way at every junction, honk, and flee when there's shooting. Cars are spawned on the
 * roads round the player (out of sight, in the haze) and taken away again behind them; parked
 * cars sit in driveways and outside the shops.
 */

/** Light phase at a junction for traffic on an axis: green, amber or red. */
export function light(s: State, n: Node, axis: "ns" | "ew"): "green" | "amber" | "red" {
  if (!n.light) return "green";
  const cyc = (s.t + n.id * 5.3) % 26;
  const nsGreen = cyc < 11;
  const nsAmber = cyc >= 11 && cyc < 13;
  const ewGreen = cyc >= 13 && cyc < 24;
  const ewAmber = cyc >= 24;
  if (axis === "ns") return nsGreen ? "green" : nsAmber ? "amber" : "red";
  return ewGreen ? "green" : ewAmber ? "amber" : "red";
}

/** Half the size of the junction box at a node, measured along a road on `axis`. */
export function junctionHalf(s: State, n: Node, axis: "ns" | "ew") {
  let h = 0;
  for (const id of n.dir) {
    if (id < 0) continue;
    const seg = s.city.roads.segs[id];
    if (seg.axis !== axis) h = Math.max(h, ROAD[seg.cls].half);
  }
  return h;
}

/** The lane line: start and end points (inside the junction boxes), its heading and length. */
export function laneLine(s: State, segId: number, fwd: boolean, lane: number) {
  const seg = s.city.roads.segs[segId];
  const A = s.city.roads.nodes[fwd ? seg.a : seg.b];
  const B = s.city.roads.nodes[fwd ? seg.b : seg.a];
  const h = Math.atan2(B.z - A.z, B.x - A.x);
  const fx = Math.cos(h);
  const fz = Math.sin(h);
  const off = ROAD[seg.cls].lanes[Math.min(lane, ROAD[seg.cls].lanes.length - 1)];
  // Australia: keep left.
  const rx = fz * off;
  const rz = -fx * off;
  const ha = junctionHalf(s, A, seg.axis);
  const hb = junctionHalf(s, B, seg.axis);
  return { ax: A.x + rx + fx * ha, az: A.z + rz + fz * ha, bx: B.x + rx - fx * hb, bz: B.z + rz - fz * hb, h, len: seg.len - ha - hb, A, B, seg, hb, ox: A.x + rx, oz: A.z + rz };
}

/** Steer toward a point (pure pursuit), at a speed. */
export function steerTo(c: Car, tx: number, tz: number, want: number, dt: number): Drive {
  const a = Math.atan2(tz - c.z, tx - c.x);
  let da = Math.atan2(Math.sin(a - c.h), Math.cos(a - c.h));
  const vf = fwdSpeed(c);
  // Reversing out of a jam: steer the other way.
  if (c.ai.backT > 0) {
    c.ai.backT -= dt;
    return { throttle: -0.7, steer: -clamp(da * 2, -1, 1), handbrake: false };
  }
  if (Math.abs(da) > 2.2 && vf < 3) da = Math.sign(da) * 2.2;
  const steer = clamp(da * 2.2, -1, 1);
  const err = want - vf;
  const throttle = clamp(err * 0.5, -1, 1);
  return { throttle, steer, handbrake: Math.abs(da) > 1.3 && vf > 12 };
}

/** Chase a point flat out (police, getaways). */
export function chasePoint(s: State, c: Car, tx: number, tz: number, want: number, dt: number): Drive {
  const d = steerTo(c, tx, tz, want, dt);
  unstick(c, d, dt);
  return d;
}

function unstick(c: Car, d: Drive, dt: number) {
  if (d.throttle > 0.3 && speedOf(c) < 0.6) c.ai.stuck += dt;
  else c.ai.stuck = Math.max(0, c.ai.stuck - dt * 2);
  if (c.ai.stuck > 2.2) {
    c.ai.backT = 1.4;
    c.ai.stuck = 0;
  }
}

/** Follow `c.ai.path` (points along the roads). */
export function followPath(s: State, c: Car, want: number, dt: number): Drive {
  const path = c.ai.path;
  if (!path.length) return NO_DRIVE;
  while (c.ai.pi < path.length - 1 && Math.hypot(path[c.ai.pi].x - c.x, path[c.ai.pi].z - c.z) < 9) c.ai.pi++;
  const p = path[c.ai.pi];
  const last = c.ai.pi >= path.length - 1;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  const turnAhead = c.ai.pi < path.length - 1 ? Math.abs(Math.atan2(Math.sin(Math.atan2(path[c.ai.pi + 1].z - p.z, path[c.ai.pi + 1].x - p.x) - c.h), Math.cos(Math.atan2(path[c.ai.pi + 1].z - p.z, path[c.ai.pi + 1].x - p.x) - c.h))) : 0;
  const slow = d < 25 && turnAhead > 0.7 ? 11 : want;
  const dr = chasePoint(s, c, p.x, p.z, last ? Math.min(want, d * 0.6) : slow, dt);
  return dr;
}

/** Pick the way out of a junction (no U-turns unless it's a dead end). */
function chooseNext(s: State, c: Car, seg: Seg, fwd: boolean) {
  const nodes = s.city.roads.nodes;
  const B = nodes[fwd ? seg.b : seg.a];
  const opts: { id: number; fwd: boolean; w: number }[] = [];
  const inH = Math.atan2(B.z - nodes[fwd ? seg.a : seg.b].z, B.x - nodes[fwd ? seg.a : seg.b].x);
  for (const id of B.dir) {
    if (id < 0 || id === seg.id) continue;
    const n = s.city.roads.segs[id];
    const nf = n.a === B.id;
    const far = nodes[nf ? n.b : n.a];
    const outH = Math.atan2(far.z - B.z, far.x - B.x);
    const turn = Math.atan2(Math.sin(outH - inH), Math.cos(outH - inH));
    const w = Math.abs(turn) < 0.3 ? 2 : 1;
    // Keep off the long bridges to the Keys unless already headed that way.
    opts.push({ id, fwd: nf, w });
  }
  if (!opts.length) return { id: seg.id, fwd: !fwd };
  let t = s.rng.next() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) {
    t -= o.w;
    if (t <= 0) return o;
  }
  return opts[0];
}

/** Ordinary driving. */
export function trafficDrive(s: State, c: Car, dt: number, flee = false): Drive {
  const segs = s.city.roads.segs;
  if (c.ai.seg < 0) attach(s, c);
  if (c.ai.seg < 0) return NO_DRIVE;
  const L = laneLine(s, c.ai.seg, c.ai.fwd, c.ai.lane);
  const fx = Math.cos(L.h);
  const fz = Math.sin(L.h);
  const along = (c.x - L.ax) * fx + (c.z - L.az) * fz;
  const sp = speedOf(c);
  const cls = L.seg.cls;
  let want = c.ai.cruise * (cls === "avenue" ? 1 : 0.78);
  if (flee) want = Math.max(want, 26);
  // Choose the way ahead early.
  if (c.ai.next < 0) {
    const n = chooseNext(s, c, L.seg, c.ai.fwd);
    c.ai.next = n.id;
    c.ai.nextFwd = n.fwd;
    // Keeping left: turning left from the kerb lane, right from the inside one.
    const nn = laneLine(s, n.id, n.fwd, 0);
    const turn = Math.atan2(Math.sin(nn.h - L.h), Math.cos(nn.h - L.h));
    const lanes = ROAD[segs[n.id].cls].lanes.length;
    c.ai.lane = turn < -0.3 ? lanes - 1 : turn > 0.3 ? 0 : Math.min(c.ai.lane, lanes - 1);
  }
  const N = laneLine(s, c.ai.next, c.ai.nextFwd, Math.min(c.ai.lane, ROAD[segs[c.ai.next].cls].lanes.length - 1));
  const turning = Math.abs(Math.atan2(Math.sin(N.h - L.h), Math.cos(N.h - L.h))) > 0.3;
  // The path: down the lane to the stop line (P0), across the box to the next lane (P1), then along it.
  const p0x = L.bx;
  const p0z = L.bz;
  const p1x = N.ax;
  const p1z = N.az;
  const box = Math.hypot(p1x - p0x, p1z - p0z);
  const bx = box > 1e-3 ? (p1x - p0x) / box : fx;
  const bz = box > 1e-3 ? (p1z - p0z) / box : fz;
  const inBox = along > L.len - 0.4;
  let prog = along;
  if (inBox) prog = L.len + clamp((c.x - p0x) * bx + (c.z - p0z) * bz, 0, box);
  if (inBox && prog >= L.len + box - 0.6) {
    // Onto the next lane.
    c.ai.seg = c.ai.next;
    c.ai.fwd = c.ai.nextFwd;
    c.ai.lane = Math.min(c.ai.lane, ROAD[segs[c.ai.seg].cls].lanes.length - 1);
    c.ai.next = -1;
    return trafficDrive(s, c, dt, flee);
  }
  const look = inBox || turning ? 4.5 + sp * 0.25 : 5 + sp * 0.55;
  const at = (d: number) => {
    if (d <= L.len) return { x: L.ax + fx * d, z: L.az + fz * d };
    if (d <= L.len + box) return { x: p0x + bx * (d - L.len), z: p0z + bz * (d - L.len) };
    const e = d - L.len - box;
    return { x: p1x + Math.cos(N.h) * e, z: p1z + Math.sin(N.h) * e };
  };
  let target = at(prog + look);
  if (turning) want = Math.min(want, inBox ? 8 : Math.max(8, (L.len - along) * 0.6 + 8));
  // Before the box: lights, and a box that's already busy with crossing traffic.
  if (!inBox && !flee) {
    const toStop = L.len - along;
    const lt = light(s, L.B, L.seg.axis);
    let hold = lt === "red" || (lt === "amber" && toStop > sp * 0.9);
    if (!hold && toStop < 10) {
      const hx = junctionHalf(s, L.B, "ew") + 1;
      const hz = junctionHalf(s, L.B, "ns") + 1;
      for (const o of s.cars) {
        if (o === c || Math.abs(o.x - L.B.x) > hx || Math.abs(o.z - L.B.z) > hz) continue;
        const dh = Math.abs(Math.atan2(Math.sin(o.h - c.h), Math.cos(o.h - c.h)));
        if (dh > 0.5 && dh < 2.7 && speedOf(o) > 0.3) hold = true;
        if (dh >= 2.7 && turning) hold = hold || speedOf(o) > 0.3;
      }
      if (!L.B.light && L.B.dir.filter((d) => d >= 0).length >= 3) want = Math.min(want, 9);
    }
    if (hold) {
      want = Math.min(want, Math.max(0, toStop - 1.2) * 0.9);
      // Keep straight while stopping.
      if (prog + look > L.len) target = { x: L.bx + fx * 2, z: L.bz + fz * 2 };
    }
  }
  // Keep a gap to whatever's ahead (cars, or people in the road).
  const fwdX = Math.cos(c.h);
  const fwdZ = Math.sin(c.h);
  const spec = VEHICLES[c.kind];
  for (const o of s.cars) {
    if (o === c) continue;
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    if (Math.abs(dx) > 34 || Math.abs(dz) > 34) continue;
    const ah = dx * fwdX + dz * fwdZ;
    if (ah <= 0 || ah > 32) continue;
    const lat = Math.abs(-dx * fwdZ + dz * fwdX);
    if (lat > 2.3) continue;
    // Oncoming in the other lane isn't in the way.
    if (Math.cos(o.h - c.h) < -0.5 && lat > 0.6) continue;
    const gap = ah - (spec.len + VEHICLES[o.kind].len) / 2;
    want = Math.min(want, Math.max(0, (gap - 2.2) * (flee ? 1.6 : 1.05)));
  }
  const pl = player(s);
  for (const p of s.peds) {
    if (p.car >= 0 || p.state !== "ok") continue;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
    const ah = dx * fwdX + dz * fwdZ;
    if (ah <= 0 || ah > 16) continue;
    if (Math.abs(-dx * fwdZ + dz * fwdX) > 1.6) continue;
    if (flee) continue;
    want = Math.min(want, Math.max(0, ah - spec.len / 2 - 2.5) * 0.8);
    if (p === pl && sp < 1 && c.horn <= 0 && s.rng.next() < 0.01) c.horn = 0.6;
  }
  const d = steerTo(c, target.x, target.z, want, dt);
  if (want < 0.5 && sp < 1) d.throttle = Math.min(d.throttle, 0);
  if (want > 3) unstick(c, d, dt);
  return d;
}

/** Put a car on the nearest lane going its way. */
export function attach(s: State, c: Car) {
  const r = nearestRoad(s.city, c.x, c.z);
  if (r.d > 30) return;
  const seg = r.seg;
  const A = s.city.roads.nodes[seg.a];
  const B = s.city.roads.nodes[seg.b];
  const h = Math.atan2(B.z - A.z, B.x - A.x);
  c.ai.seg = seg.id;
  c.ai.fwd = Math.cos(c.h - h) >= 0;
  c.ai.lane = 0;
  c.ai.next = -1;
}

/** Which way a car drives this step (by its mode). */
export function aiDrive(s: State, c: Car, dt: number): Drive {
  const driver = pedById(s, c.seats[0]);
  if (!driver || driver.state !== "ok" || driver.role === "player") return NO_DRIVE;
  switch (c.ai.mode) {
    case "traffic":
      return trafficDrive(s, c, dt);
    case "flee":
      return trafficDrive(s, c, dt, true);
    case "police":
    case "swat":
      return policeDrive(s, c, dt);
    case "goto":
    case "escape":
      return followPath(s, c, c.ai.cruise, dt);
    case "chase": {
      const t = pedById(s, c.ai.target);
      const tc = t && t.car >= 0 ? carById(s, t.car) : undefined;
      const tx = tc ? tc.x : t ? t.x : c.x;
      const tz = tc ? tc.z : t ? t.z : c.z;
      return chasePoint(s, c, tx, tz, c.ai.cruise, dt);
    }
    default:
      return { throttle: -clamp(fwdSpeed(c) / 4, -1, 1), steer: 0, handbrake: speedOf(c) < 3 };
  }
}

/* ------------------------------------------------------------------ people */

const SKIN = ["#f1c7a8", "#e2b48f", "#c8916a", "#a7714c", "#8a5a3c", "#5e3b26", "#f3d2b8", "#d6a27a"];
const SHIRTS = ["#e14b6a", "#3fa7a0", "#f2b134", "#f6f1e7", "#4b8fd6", "#1c1f24", "#7a5cc4", "#f08a5d", "#c5e8c1", "#e8dcc0", "#2b3442", "#f3c1d2", "#9aa48a", "#d81e2b"];
const PANTS = ["#2b3a55", "#1c1f24", "#e8dcc0", "#3a3f47", "#5a4030", "#f6f1e7", "#2f5a3a", "#8a8f96", "#3d4530"];
const HAIR = ["#1b1410", "#3a2a1e", "#6b4a2e", "#b98a52", "#d8c49a", "#8a8f96", "#24170f"];

export function randomLook(s: State, beach = false): Look {
  const r = s.rng;
  const female = r.next() < 0.48;
  return {
    seed: r.int(1, 1_000_000),
    skin: r.pick(SKIN),
    shirt: r.pick(SHIRTS),
    pants: beach ? r.pick(["#e14b6a", "#3fa7a0", "#f2b134", "#4b8fd6", "#1c1f24"]) : r.pick(PANTS),
    hair: r.pick(HAIR),
    female,
    top: beach ? "tank" : undefined,
    bottom: beach ? (female ? "skirt" : "shorts") : undefined,
  };
}

/* ------------------------------------------------------------------ spawning */

/** A point on a lane between rMin and rMax from (x, z), heading along the lane. */
export function roadSpawn(s: State, x: number, z: number, rMin: number, rMax: number) {
  const segs = s.city.roads.segs;
  const nodes = s.city.roads.nodes;
  for (let tries = 0; tries < 24; tries++) {
    const seg = segs[s.rng.int(0, segs.length - 1)];
    const A = nodes[seg.a];
    const B = nodes[seg.b];
    const t = s.rng.range(0.2, 0.8);
    const fwd = s.rng.next() < 0.5;
    const lanes = ROAD[seg.cls].lanes;
    const lane = s.rng.int(0, lanes.length - 1);
    const L = laneLine(s, seg.id, fwd, lane);
    const px = L.ax + (L.bx - L.ax) * t;
    const pz = L.az + (L.bz - L.az) * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < rMin || d > rMax) continue;
    if (groundY(px, pz) < WATER_Y + 0.3 && !onDeck(px, pz)) continue;
    if (s.cars.some((c) => Math.abs(c.x - px) < 12 && Math.abs(c.z - pz) < 12)) continue;
    void A;
    void B;
    return { x: px, z: pz, h: L.h, seg: seg.id, fwd, lane };
  }
  return null;
}

function trafficKind(s: State, x: number, z: number): VehicleKind {
  const d = districtAt(x, z);
  if (s.rng.next() < 0.05) return "police";
  if (d === "toorak" || ((d === "southyarra" || d === "southbank" || d === "stkilda") && s.rng.next() < 0.3)) return s.rng.pick(RICH_TRAFFIC);
  if (d === "docks" || d === "westmelb") return s.rng.pick(DOCK_TRAFFIC);
  if (d === "cbd" && s.rng.next() < 0.18) return "taxi";
  return s.rng.pick(TRAFFIC);
}

let spawnTick = 0;

/** Keep the roads (and sidewalks) round the player busy; clear what's left far behind. */
export function populate(s: State, dt: number, spawnPed: () => void) {
  spawnTick -= dt;
  const pos = playerPos(s);
  // Take away what's far off (never mission vehicles, the player's, or anyone's in a chase).
  s.cars = s.cars.filter((c) => {
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    const keep = c.tag || (c.own && !c.wrecked) || c.seats.includes(s.player) || (c.ai.mode === "police" && d < 320) || (VEHICLES[c.kind].air && !c.wrecked && c.tag !== "gone");
    const far = d > (c.wrecked ? 150 : 250);
    if (keep && c.tag !== "gone") return true;
    if (!far && c.tag !== "gone") return true;
    for (const id of c.seats) {
      const p = pedById(s, id);
      if (p) p.tag = "__gone";
    }
    return false;
  });
  s.peds = s.peds.filter((p) => p.tag !== "__gone");
  if (spawnTick > 0 || s.empty) return;
  spawnTick = 0.18;
  const night = s.clock < 6 * 60 || s.clock > 21 * 60;
  const traffic = s.cars.filter((c) => c.ai.mode === "traffic" || c.ai.mode === "flee").length;
  const want = Math.round(s.density.cars * (night ? 0.65 : 1));
  if (traffic < want) {
    const sp = roadSpawn(s, pos.x, pos.z, 75, 210);
    if (sp) {
      const kind = trafficKind(s, sp.x, sp.z);
      const c = makeCar(s, kind, sp.x, sp.z, sp.h, VEHICLES[kind].colors ? undefined : s.rng.pick(PAINT));
      c.ai.mode = "traffic";
      c.ai.seg = sp.seg;
      c.ai.fwd = sp.fwd;
      c.ai.lane = sp.lane;
      c.ai.cruise = s.rng.range(13, 17.5);
      c.vx = Math.cos(sp.h) * c.ai.cruise * 0.7;
      c.vz = Math.sin(sp.h) * c.ai.cruise * 0.7;
      const look = randomLook(s);
      if (VEHICLES[kind].police) {
        look.shirt = "#1f2b44";
        look.pants = "#1a2233";
      }
      const drv = makePed(s, VEHICLES[kind].police ? "cop" : "civ", c.x, c.z, c.h, look, VEHICLES[kind].police ? { weapon: "pistol", clip: 12, ammo: { pistol: 200 }, armor: 30 } : {});
      drv.ai.mode = "drive";
      seat(s, drv, c, 0);
      if (s.rng.next() < 0.2 && c.seats.length > 1) {
        const pas = makePed(s, "civ", c.x, c.z, c.h, randomLook(s));
        pas.ai.mode = "ride";
        seat(s, pas, c, 1);
      }
    }
  }
  parked(s, pos.x, pos.z);
  spawnPed();
}

/** Parked cars: on drives, outside shops, and the leads' own rides at home. */
const parkedAt = new Map<number, number>();
function parked(s: State, x: number, z: number) {
  const spots = s.city.parking;
  for (let i = 0; i < spots.length; i++) {
    const p = spots[i];
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > 150 || d < 60) continue;
    if ((parkedAt.get(i) ?? -1e9) > s.t - 120) continue;
    parkedAt.set(i, s.t);
    if (s.cars.some((c) => Math.abs(c.x - p.x) < 4 && Math.abs(c.z - p.z) < 4)) continue;
    const kind = trafficKind(s, p.x, p.z);
    if (VEHICLES[kind].police) continue;
    const c = makeCar(s, kind, p.x, p.z, p.h, VEHICLES[kind].colors ? undefined : s.rng.pick(PAINT));
    c.ai.mode = "parked";
    c.locked = s.rng.next() < 0.7;
  }
  // The leads' own cars wait outside home.
  for (const ch of s.chars) {
    const L = LEADS[ch.id];
    const home = s.city.pois.find((q) => q.id === L.home)!;
    const d = Math.hypot(home.x - x, home.z - z);
    if (d > 160) continue;
    if (s.cars.some((c) => c.tag === `ride-${ch.id}` && !c.wrecked)) continue;
    if (d < 45 && s.t > 2) continue;
    // At the curb on the near side of the street, a little along from the door.
    const r = nearestRoad(s.city, home.x + home.fz * 7, home.z - home.fx * 7);
    const k = Math.hypot(home.x - r.x, home.z - r.z) || 1;
    const off = ROAD[r.seg.cls].half - 1.4;
    const h = r.seg.axis === "ns" ? (home.x > r.x ? Math.PI / 2 : -Math.PI / 2) : home.z > r.z ? Math.PI : 0;
    const c = makeCar(s, L.ride, r.x + ((home.x - r.x) / k) * off, r.z + ((home.z - r.z) / k) * off, h, L.rideColor, { own: true, tag: `ride-${ch.id}` });
    c.ai.mode = "parked";
  }
}

export { speedOf };
