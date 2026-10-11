/**
 * Inside one of your stores, in 3D: a shop floor behind a glass front on a city street, fitted out
 * for what it sells (gondola shelves, fridges, clothes rails, a car showroom, jewellery cases, a
 * builders' yard), its shelves as full as its stock, tills staffed by its staff, and shoppers who
 * come in, browse, queue and leave, as many as it's drawing right now.
 */
import * as THREE from "three";
import { mergeStatic } from "@/nextx/batch";
import { Rig } from "@/nextx/rig";
import { DAY, HOUR, ITEMS, STORES, STORE_HOURS, city, type ItemId, type StoreKind } from "../data";
import type { State, Store } from "../sim";
import { asphaltTexture, box, car, floorTexture, mat, palletGeometry, rbox, signTexture, streetLamp, tree } from "./models";
import { Daylight, planeHit, type View3D } from "./view";
import type { Quality } from "./world";

/** The room for each store size: width along the street, depth back from it. */
const SIZES: [number, number][] = [
  [14, 10],
  [18, 12],
  [22, 14],
];
const WALL = 3.2;

interface Shopper {
  g: THREE.Group;
  legs: THREE.Object3D[];
  x: number;
  z: number;
  tx: number;
  tz: number;
  wait: number;
  /** browse → queue → leave → (gone) */
  phase: "browse" | "queue" | "leave" | "gone";
  stops: number;
}

const shopperTemplates = new Map<number, THREE.Group>();
/** A shopper in everyday clothes (a dozen looks, merged once and copied). */
function shopperModel(n: number) {
  const k = n % 12;
  let t = shopperTemplates.get(k);
  if (!t) {
    t = new THREE.Group();
    const shirts = ["#2f6fe4", "#e0773c", "#1f9d74", "#d64fa0", "#f2c94c", "#5b6b86", "#ffffff", "#8a5cf0", "#c0392b", "#3fb6a8", "#2b2d33", "#e66aa0"];
    const pants = ["#2c3443", "#3b5ea8", "#5c4a3a", "#1b1e24"];
    const skin = ["#f0c7a0", "#c99a72", "#8d5f3d", "#e8b88f"][k % 4];
    [-0.09, 0.09].forEach((x, i) => {
      const hip = new THREE.Group();
      hip.name = `hip${i}`;
      hip.userData.dynamic = true;
      hip.position.set(x, 0.82, 0);
      const l = box(0.14, 0.8, 0.14, mat(pants[k % 4], 0.8), 0, -0.8, 0);
      hip.add(l);
      t!.add(hip);
    });
    t.add(rbox(0.42, 0.6, 0.24, mat(shirts[k], 0.7), 0, 0.82, 0, 0.08));
    for (const x of [-0.26, 0.26]) t.add(rbox(0.1, 0.55, 0.12, mat(shirts[k], 0.7), x, 0.85, 0, 0.04));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(skin, 0.8));
    head.position.y = 1.58;
    head.castShadow = true;
    t.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(["#2b1d14", "#6b4a2f", "#d9b56d", "#1b1e24"][k % 4], 0.9));
    hair.position.y = 1.6;
    t.add(hair);
    t.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    mergeStatic(t, { palette: true });
    shopperTemplates.set(k, t);
  }
  const g = t.clone(true);
  return { g, legs: [g.getObjectByName("hip0")!, g.getObjectByName("hip1")!] };
}

let tileTex: THREE.Texture | null = null;
/** Polished floor tiles. */
function tiles() {
  if (tileTex) return tileTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#eceae4";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#e2dfd7";
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  g.strokeRect(64, 64, 64, 64);
  g.strokeRect(64, 0, 64, 64);
  g.strokeRect(0, 64, 64, 64);
  tileTex = new THREE.CanvasTexture(c);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  return tileTex;
}

export class StoreWorld implements View3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.3, 600);
  readonly rig: Rig;
  private day: Daylight;
  private storeId = -1;
  private key = "";
  private room = new THREE.Group();
  private goods = new THREE.Group();
  private people = new THREE.Group();
  private shoppers: Shopper[] = [];
  private staff: THREE.Group[] = [];
  private stockKey = "";
  private w = 14;
  private d = 10;
  private kind: StoreKind = "discount";
  /** Where shoppers stop to browse (in front of each fixture), and the tills. */
  private stops: [number, number][] = [];
  private tills: [number, number][] = [];
  private time = 0;
  private interior: THREE.HemisphereLight;
  private spawn = 0;

  constructor(readonly quality: Quality) {
    this.rig = new Rig({ minDist: 6, maxDist: 70, minPitch: 0.3, maxPitch: 1.45 }, { target: new THREE.Vector3(7, 0, 5), dist: 26, yaw: 0.35, pitch: 0.85 });
    this.day = new Daylight(this.scene, quality !== "low", 30);
    this.interior = new THREE.HemisphereLight("#fffaf0", "#bdb8ad", 0.9);
    this.scene.add(this.interior, this.room, this.goods, this.people);
  }

  get nightness() {
    return this.day.night * 0.6;
  }

  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    this.day.bake(renderer);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 48 : 34;
    this.camera.updateProjectionMatrix();
  }

  groundAt(nx: number, ny: number, y = 0) {
    return planeHit(this.camera, nx, ny, y);
  }

  private clear(G: THREE.Group) {
    for (const o of [...G.children]) {
      G.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.own) m.geometry.dispose();
      });
    }
  }

  /** The room, the shopfront and the street, and the fittings for what it sells. */
  private buildRoom(st: Store) {
    this.clear(this.room);
    const def = STORES[st.kind];
    const [W, D] = SIZES[Math.max(0, Math.min(2, st.level - 1))];
    this.w = W;
    this.d = D;
    this.kind = st.kind;
    const G = this.room;
    // The floor, polished concrete in a dealership and a builders' yard, tiles elsewhere.
    const fm = st.kind === "cars" || st.kind === "builders" ? new THREE.MeshStandardMaterial({ map: floorTexture(), color: "#e3e5ea", roughness: 0.25, metalness: 0.1 }) : new THREE.MeshStandardMaterial({ map: tiles(), roughness: 0.35 });
    (fm.map as THREE.Texture).repeat.set(W / 2, D / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), fm);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0.01, D / 2);
    floor.receiveShadow = true;
    floor.userData.own = true;
    G.add(floor);
    // Back and side walls, a band in the store's colour, and the glass front with its door and sign.
    const wall = mat("#f3f1ec", 0.85);
    const band = mat(def.color, 0.5);
    G.add(box(W, WALL, 0.2, wall, W / 2, 0, -0.1));
    G.add(box(0.2, WALL, D, wall, -0.1, 0, D / 2));
    G.add(box(0.2, WALL, D, wall, W + 0.1, 0, D / 2));
    G.add(box(W, 0.35, 0.22, band, W / 2, 2.5, -0.1));
    G.add(box(0.22, 0.35, D, band, -0.1, 2.5, D / 2));
    G.add(box(0.22, 0.35, D, band, W + 0.1, 2.5, D / 2));
    const glass = new THREE.MeshStandardMaterial({ color: "#bcd8f0", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, depthWrite: false });
    const frame = mat("#2b2f3a", 0.45, 0.5);
    for (const [x0, x1] of [[0, W / 2 - 1.2], [W / 2 + 1.2, W]]) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 2.6, 0.05), glass);
      pane.position.set((x0 + x1) / 2, 1.3, D);
      pane.userData.own = true;
      G.add(pane);
      G.add(box(x1 - x0, 0.12, 0.12, frame, (x0 + x1) / 2, 0, D));
    }
    G.add(box(W + 0.4, 0.6, 0.3, frame, W / 2, 2.6, D));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(W - 2, 9), 1.0), new THREE.MeshBasicMaterial({ map: signTexture(st.name, def.color) }));
    sign.position.set(W / 2, 3.6, D + 0.2);
    sign.userData.own = true;
    G.add(sign);
    G.add(box(Math.min(W - 2, 9) + 0.3, 1.2, 0.18, frame, W / 2, 3.0, D + 0.05));
    for (const x of [W / 2 - 1.25, W / 2 + 1.25]) G.add(box(0.12, 2.6, 0.12, frame, x, 0, D));
    // Outside: the pavement, the road, lamps and trees.
    const pave = new THREE.MeshStandardMaterial({ map: floorTexture(), color: "#d6d3cc", roughness: 0.9 });
    const pv = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, 5), pave);
    pv.rotation.x = -Math.PI / 2;
    pv.position.set(W / 2, 0, D + 2.5);
    pv.receiveShadow = true;
    pv.userData.own = true;
    G.add(pv);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, 9), new THREE.MeshStandardMaterial({ map: asphaltTexture("#585d66"), roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(W / 2, -0.01, D + 9.5);
    road.userData.own = true;
    G.add(road);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, 60), mat("#cfcabe", 0.95));
    back.rotation.x = -Math.PI / 2;
    back.position.set(W / 2, -0.02, D - 25);
    back.userData.own = true;
    G.add(back);
    for (let x = -12; x < W + 14; x += 9) {
      const l = streetLamp();
      l.rotation.y = Math.PI / 2;
      l.position.set(x, 0, D + 4.6);
      G.add(l);
      const t = tree(Math.abs(Math.floor(x)));
      t.scale.setScalar(2.2);
      t.position.set(x + 4.5, 0, D + 4.2);
      G.add(t);
    }
    // Shops next door.
    for (const [x0, x1] of [[-14, -0.4], [W + 0.4, W + 14]]) {
      const b = box(x1 - x0, 7, D + 0.4, mat(["#d9cbb4", "#c98b6b"][x0 < 0 ? 0 : 1], 0.85), (x0 + x1) / 2, 0, D / 2);
      G.add(b);
    }
    this.fitOut(st);
    this.rig.jump({ target: new THREE.Vector3(W / 2, 0.5, D / 2 + 0.5), dist: 10 + W * 1.1, yaw: 0.3, pitch: 0.82 });
  }

  /** Fixtures for the trade: and where shoppers stop to look. */
  private fitOut(st: Store) {
    const W = this.w;
    const D = this.d;
    const G = this.room;
    const def = STORES[st.kind];
    this.stops = [];
    this.tills = [];
    const metal = mat("#c9ced8", 0.35, 0.6);
    const shelfMat = mat("#f6f6f4", 0.5);
    const rows = st.level + 1;
    const usable = D - 3.5;
    // Tills at the front, one for each of the staff (up to four).
    const tillN = Math.max(1, Math.min(4, st.staff));
    for (let i = 0; i < tillN; i++) {
      const x = 1.6 + i * 2.2;
      G.add(rbox(1.6, 1.0, 0.7, mat("#2b2f3a", 0.5, 0.2), x, 0, D - 2.1, 0.05));
      G.add(box(0.4, 0.3, 0.05, mat("#3a6ea8", 0.2, 0.3), x + 0.3, 1.0, D - 2.25, false));
      this.tills.push([x, D - 1.3]);
    }
    if (st.kind === "cars") {
      for (let i = 0; i < Math.min(3, rows); i++) {
        const x = W / 2 + (i - (Math.min(3, rows) - 1) / 2) * 6;
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.18, 32), mat("#e8ecf4", 0.2, 0.3));
        pod.position.set(x, 0.09, D / 2 - 1);
        pod.userData.own = true;
        G.add(pod);
        this.stops.push([x + 2.8, D / 2]);
      }
    } else if (st.kind === "fashion") {
      for (let r = 0; r < rows; r++) {
        const z = 1.6 + (r * usable) / rows;
        for (const x of [2, W - 2.2]) {
          G.add(box(0.06, 1.6, 0.06, metal, x - 1.6, 0, z));
          G.add(box(0.06, 1.6, 0.06, metal, x + 1.6, 0, z));
          G.add(box(3.3, 0.05, 0.05, metal, x, 1.55, z));
          this.stops.push([x, z + 1.0]);
        }
      }
      for (const x of [W / 2 - 1.5, W / 2 + 1.5]) {
        G.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16), metal).translateX(x).translateY(0.04).translateZ(D - 3.6));
        G.add(rbox(0.36, 0.7, 0.22, mat("#f3ede4", 0.6), x, 0.85, D - 3.6, 0.08));
        G.add(box(0.05, 0.85, 0.05, metal, x, 0, D - 3.6));
      }
    } else if (st.kind === "jeweller") {
      for (let r = 0; r < rows; r++) {
        const z = 2 + (r * usable) / rows;
        for (let x = 2.5; x < W - 2; x += 4) {
          G.add(rbox(3, 0.9, 0.8, mat("#2b2f3a", 0.35, 0.3), x, 0, z, 0.04));
          const top = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.25, roughness: 0.05 }));
          top.position.set(x, 1.05, z);
          top.userData.own = true;
          G.add(top);
          this.stops.push([x, z + 1.0]);
        }
      }
    } else if (st.kind === "builders") {
      for (let r = 0; r < rows; r++) {
        const z = 1.0 + (r * usable) / rows;
        G.add(box(W - 3, 0.1, 1.2, mat("#e0773c", 0.5, 0.3), W / 2, 1.6, z));
        for (let x = 1.6; x < W - 1; x += 2.6) G.add(box(0.1, 3, 0.1, mat("#2f6fe4", 0.5, 0.3), x, 0, z));
        this.stops.push([W / 2, z + 1.4]);
      }
    } else {
      // Gondola shelving: rows down the floor, three shelves high.
      for (let r = 0; r < rows; r++) {
        const z = 1.2 + (r * usable) / rows;
        G.add(box(W - 4, 0.12, 0.9, mat("#3a414f", 0.6), W / 2, 0, z));
        G.add(box(W - 4, 1.7, 0.06, shelfMat, W / 2, 0.12, z));
        for (const y of [0.45, 0.95, 1.45]) G.add(box(W - 4, 0.04, 0.9, shelfMat, W / 2, y, z));
        G.add(box(W - 4, 0.25, 0.08, mat(def.color, 0.5), W / 2, 1.82, z + 0.48));
        for (let x = 3; x < W - 2; x += 4) this.stops.push([x, z + 1.1]);
      }
      if (st.kind === "grocery") {
        // Fridges along the back wall, glowing.
        for (let x = 1; x < W - 1; x += 2) {
          G.add(rbox(1.9, 2.1, 0.7, mat("#dfe3ea", 0.35, 0.3), x + 0.95, 0, 0.45, 0.04));
          G.add(box(1.7, 1.7, 0.03, new THREE.MeshBasicMaterial({ color: "#d9f0ff" }), x + 0.95, 0.25, 0.82, false));
        }
      }
    }
    shadowAll(G);
    this.stockKey = "";
  }

  /** What's on the shelves, as full as the stock. */
  private fillShelves(st: Store) {
    this.clear(this.goods);
    const def = STORES[st.kind];
    const W = this.w;
    const D = this.d;
    const rows = st.level + 1;
    const usable = D - 3.5;
    const goods = def.goods;
    const cap = 1 + st.level;
    const fill = (item: ItemId) => Math.max(0, Math.min(1, (st.stock[item] ?? 0) / cap));
    const G = this.goods;
    if (st.kind === "cars") {
      for (let i = 0; i < Math.min(3, rows); i++) {
        const item = goods[i % goods.length];
        if ((st.stock[item] ?? 0) < 0.5 && i > 0) continue;
        if ((st.stock[item] ?? 0) <= 0.05) continue;
        const c = car(i * 2 + (item === "ecar" ? 1 : 2));
        c.scale.setScalar(1.05);
        c.rotation.y = 0.6 + i;
        c.position.set(W / 2 + (i - (Math.min(3, rows) - 1) / 2) * 6, 0.18, D / 2 - 1);
        G.add(c);
      }
      return;
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const ms: THREE.Matrix4[] = [];
    const cs: THREE.Color[] = [];
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col: string, k = 0) => {
      ms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + sy / 2, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
      const c = new THREE.Color(col);
      c.offsetHSL(0, 0, ((k * 37) % 9) / 60 - 0.07);
      cs.push(c);
    };
    if (st.kind === "fashion") {
      let k = 0;
      for (let r = 0; r < rows; r++) {
        const z = 1.6 + (r * usable) / rows;
        for (const x of [2, W - 2.2]) {
          const item = goods[k++ % goods.length];
          const n = Math.round(10 * fill(item));
          for (let i = 0; i < n; i++) add(x - 1.4 + i * 0.3, 0.75, z, 0.08, 0.75, 0.45, ITEMS[item].load, i);
        }
      }
    } else if (st.kind === "jeweller") {
      let k = 0;
      for (let r = 0; r < rows; r++) {
        const z = 2 + (r * usable) / rows;
        for (let x = 2.5; x < W - 2; x += 4) {
          const item = goods[k++ % goods.length];
          const n = Math.round(8 * fill(item));
          for (let i = 0; i < n; i++) add(x - 1.2 + i * 0.34, 0.92, z, 0.12, 0.05, 0.12, "#f2d77c", i);
        }
      }
    } else if (st.kind === "builders") {
      let k = 0;
      for (let r = 0; r < rows; r++) {
        const z = 1.0 + (r * usable) / rows;
        for (let x = 2.9; x < W - 1.5; x += 2.6) {
          const item = goods[k++ % goods.length];
          const f = fill(item);
          for (const y of [0, 1.7]) if (f > (y ? 0.5 : 0.02)) add(x, y + 0.15, z, 1.1, 0.9, 1.0, ITEMS[item].load, k);
        }
      }
      const pal = new THREE.InstancedMesh(palletGeometry(), mat("#c99b62", 0.85), ms.length);
      ms.forEach((m, i) => {
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        pal.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y - 0.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1.1, 1, 1.1)));
      });
      pal.castShadow = true;
      G.add(pal);
    } else {
      // Products along each shelf, item by item, as many as the stock fills.
      let k = 0;
      for (let r = 0; r < rows; r++) {
        const z = 1.2 + (r * usable) / rows;
        const per = Math.floor((W - 4.4) / 0.36);
        for (const y of [0.49, 0.99, 1.49]) {
          for (const side of [-0.24, 0.24]) {
            const item = goods[k++ % goods.length];
            const n = Math.round(per * fill(item));
            for (let i = 0; i < n; i++) add(2.2 + 0.18 + i * 0.36, y, z + side, 0.3, 0.32, 0.3, ITEMS[item].load, i + k);
          }
        }
      }
    }
    if (!ms.length) return;
    const im = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: st.kind === "jeweller" ? 0.8 : 0 }), ms.length);
    ms.forEach((m, i) => im.setMatrixAt(i, m));
    cs.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = true;
    im.receiveShadow = true;
    G.add(im);
  }

  /** How many shoppers it's drawing now (none when it's shut). */
  private wanted(s: State, st: Store) {
    const h = Math.floor((s.time % DAY) / HOUR);
    if (!st.open || h < STORE_HOURS[0] || h >= STORE_HOURS[1]) return 0;
    return Math.max(1, Math.min(14, Math.round((2 + st.level * 2) * (st.happy / 100) * city(st.city).pop * Math.min(1.4, st.price ? 1 / st.price : 1))));
  }

  private stepShoppers(s: State, st: Store, dt: number) {
    const want = this.wanted(s, st);
    const live = this.shoppers.filter((x) => x.phase !== "gone");
    this.spawn -= dt;
    if (live.length < want && this.spawn <= 0) {
      this.spawn = 1.2;
      let sh = this.shoppers.find((x) => x.phase === "gone");
      if (!sh) {
        const m = shopperModel(this.shoppers.length + st.id);
        this.people.add(m.g);
        sh = { g: m.g, legs: m.legs, x: 0, z: 0, tx: 0, tz: 0, wait: 0, phase: "gone", stops: 0 };
        this.shoppers.push(sh);
      }
      sh.x = this.w / 2 + (Math.random() - 0.5) * 1.4;
      sh.z = this.d + 0.6;
      sh.phase = "browse";
      sh.stops = 1 + Math.floor(Math.random() * 3);
      this.pickStop(sh);
      sh.g.visible = true;
    }
    for (const sh of this.shoppers) {
      if (sh.phase === "gone") {
        sh.g.visible = false;
        continue;
      }
      const dx = sh.tx - sh.x;
      const dz = sh.tz - sh.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.08) {
        const v = Math.min(d, 1.25 * dt);
        sh.x += (dx / d) * v;
        sh.z += (dz / d) * v;
        sh.g.rotation.y = Math.atan2(dx, dz);
        const ph = this.time * 7 + sh.tx;
        sh.legs[0].rotation.x = Math.sin(ph) * 0.45;
        sh.legs[1].rotation.x = -Math.sin(ph) * 0.45;
      } else {
        sh.legs[0].rotation.x = sh.legs[1].rotation.x = 0;
        sh.wait -= dt;
        if (sh.wait <= 0) {
          if (sh.phase === "browse" && --sh.stops > 0) this.pickStop(sh);
          else if (sh.phase === "browse") {
            sh.phase = "queue";
            const [tx, tz] = this.tills[Math.floor(Math.random() * this.tills.length)] ?? [this.w / 2, this.d - 1.2];
            sh.tx = tx;
            sh.tz = tz;
            sh.wait = 2 + Math.random() * 2;
          } else if (sh.phase === "queue") {
            sh.phase = "leave";
            sh.tx = this.w / 2 + (Math.random() - 0.5) * 1.6;
            sh.tz = this.d + 2.2;
            sh.wait = 0;
          } else sh.phase = "gone";
        }
      }
      // Shut, everyone heads out.
      if (!want && sh.phase !== "leave") {
        sh.phase = "leave";
        sh.tx = this.w / 2;
        sh.tz = this.d + 2.2;
      }
      sh.g.position.set(sh.x, 0, sh.z);
    }
  }

  private pickStop(sh: Shopper) {
    const [x, z] = this.stops[Math.floor(Math.random() * this.stops.length)] ?? [this.w / 2, this.d / 2];
    sh.tx = x + (Math.random() - 0.5) * 1.2;
    sh.tz = z + (Math.random() - 0.5) * 0.4;
    sh.wait = 2 + Math.random() * 3;
  }

  /** Staff: one at each till, the rest on the shop floor. */
  private syncStaff(st: Store) {
    const n = Math.max(1, st.staff);
    while (this.staff.length < n) {
      const m = shopperModel(this.staff.length * 5 + 2);
      this.people.add(m.g);
      // A lanyard in the store's colour, so you can tell them apart.
      m.g.add(box(0.44, 0.08, 0.26, mat(STORES[st.kind].color, 0.5), 0, 1.3, 0));
      this.staff.push(m.g);
    }
    this.staff.forEach((g, i) => {
      g.visible = i < n && st.open;
      const till = this.tills[i];
      if (till) {
        g.position.set(till[0], 0, this.d - 2.9);
        g.rotation.y = 0;
      } else {
        const [x, z] = this.stops[(i * 3) % Math.max(1, this.stops.length)] ?? [2, 2];
        g.position.set(x + 0.6, 0, z - 0.2);
        g.rotation.y = Math.PI;
      }
    });
  }

  /** Keep in step with a store: called every frame while it's showing. */
  sync(s: State, st: Store, dt: number, opts: { daylight?: "cycle" | "day" } = {}) {
    this.time += dt;
    const key = `${st.id}|${st.level}|${st.kind}|${Math.min(4, st.staff)}`;
    if (key !== this.key) {
      this.key = key;
      if (st.id !== this.storeId) {
        for (const sh of this.shoppers) this.people.remove(sh.g);
        this.shoppers = [];
        for (const g of this.staff) this.people.remove(g);
        this.staff = [];
      }
      this.storeId = st.id;
      this.buildRoom(st);
    }
    const sk = def2(st);
    if (sk !== this.stockKey) {
      this.stockKey = sk;
      this.fillShelves(st);
    }
    const lamps = this.day.sync(s.time, new THREE.Vector3(this.w / 2, 0, this.d / 2), { storm: s.event?.kind === "storm", day: opts.daylight === "day" });
    const h = Math.floor((s.time % DAY) / HOUR);
    const trading = st.open && h >= STORE_HOURS[0] && h < STORE_HOURS[1];
    this.interior.intensity = (trading ? 0.9 : 0.35) + (1 - lamps) * 0.2;
    this.syncStaff(st);
    this.stepShoppers(s, st, dt);
  }

  update(dt: number) {
    this.rig.step(dt, this.camera);
    this.day.follow(this.camera, dt);
  }

  dispose() {
    this.clear(this.room);
    this.clear(this.goods);
    this.day.dispose();
  }
}

/** A key for what's on the shelves (to the tenth of a pallet). */
function def2(st: Store) {
  return STORES[st.kind].goods.map((i) => Math.round((st.stock[i] ?? 0) * 10)).join(",");
}

function shadowAll(G: THREE.Object3D) {
  G.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material).transparent) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}
