import * as THREE from "three";
import { H, PAVEMENT_Z, ROAD_Z, ROOMS, W, type FloorId } from "../data";
import { BUILT, cx, cz, FLOOR_IDS, inside, N, PLANNED, idx, type World } from "../world";
import { asphaltTexture, dirtTexture, floorTexture, grassTexture, labelTexture } from "./textures";

const WALL_H = 2.7;
const CUT_H = 0.75;
const BLUEPRINT = new THREE.MeshBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.35, depthWrite: false });

/**
 * Everything built into the ground: the plot and street, floors, walls (full height or
 * cut away), doors that swing open as people pass, blueprints, room tints and labels,
 * and dirt.
 */
export class BuildingView {
  group = new THREE.Group();
  private floors = new Map<FloorId, THREE.InstancedMesh>();
  private planFloors: THREE.InstancedMesh;
  private walls: THREE.InstancedMesh;
  private wallTops: THREE.InstancedMesh;
  private planWalls: THREE.InstancedMesh;
  private roomTint: THREE.InstancedMesh;
  private dirt: THREE.InstancedMesh;
  private doors = new Map<number, { g: THREE.Group; leaf: THREE.Object3D; open: number; alongX: boolean }>();
  private doorGroup = new THREE.Group();
  private labels = new THREE.Group();
  private version = -1;
  cutaway = true;
  roomsVisible = true;
  private wallMat = new THREE.MeshStandardMaterial({ color: "#f1efe9", roughness: 0.85 });
  private capMat = new THREE.MeshStandardMaterial({ color: "#6b7280", roughness: 0.7 });

  constructor() {
    // The plot (grass), with the street along the bottom.
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(W + 120, H + 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    grass.position.set(W / 2, -0.02, H / 2);
    grass.receiveShadow = true;
    const roadTex = asphaltTexture().clone();
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set((W + 120) / 6, 0.6);
    roadTex.needsUpdate = true;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 120, H - ROAD_Z + 0.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
    road.position.set(W / 2, 0, (ROAD_Z + H) / 2 + 0.25);
    road.receiveShadow = true;
    const pave = new THREE.Mesh(new THREE.BoxGeometry(W + 120, 0.12, 1), new THREE.MeshStandardMaterial({ map: floorTexture("path"), color: "#d9d3c6", roughness: 1 }));
    pave.position.set(W / 2, 0.04, PAVEMENT_Z + 0.5);
    pave.receiveShadow = true;
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(W + 120, 0.12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#f5e9b8" }));
    dash.position.set(W / 2, 0.01, ROAD_Z + 1.6);
    // A plot boundary: low hedge along the back and sides.
    const hedgeMat = new THREE.MeshStandardMaterial({ color: "#3f7a32", roughness: 1 });
    for (const [x, z, w, d] of [
      [W / 2, -0.5, W + 1, 1],
      [-0.5, PAVEMENT_Z / 2, 1, PAVEMENT_Z + 1],
      [W + 0.5, PAVEMENT_Z / 2, 1, PAVEMENT_Z + 1],
    ]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), hedgeMat);
      h.position.set(x, 0.45, z);
      h.castShadow = h.receiveShadow = true;
      this.group.add(h);
    }
    this.group.add(grass, road, pave, dash);
    this.addNeighbourhood();

    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const id of FLOOR_IDS) {
      const m = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ map: floorTexture(id), roughness: id === "tile" ? 0.35 : 0.8 }), N);
      m.receiveShadow = true;
      m.count = 0;
      this.floors.set(id, m);
      this.group.add(m);
    }
    this.planFloors = new THREE.InstancedMesh(plane, BLUEPRINT, N);
    this.planFloors.count = 0;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.walls = new THREE.InstancedMesh(box, this.wallMat, N);
    this.walls.castShadow = this.walls.receiveShadow = true;
    this.walls.count = 0;
    this.wallTops = new THREE.InstancedMesh(new THREE.BoxGeometry(1.001, 0.06, 1.001), this.capMat, N);
    this.wallTops.count = 0;
    this.planWalls = new THREE.InstancedMesh(box, BLUEPRINT, N);
    this.planWalls.count = 0;
    this.roomTint = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false }), N);
    this.roomTint.count = 0;
    this.roomTint.renderOrder = 2;
    this.dirt = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ map: dirtTexture(), transparent: true, depthWrite: false }), N);
    this.dirt.count = 0;
    this.dirt.renderOrder = 1;
    this.group.add(this.planFloors, this.walls, this.wallTops, this.planWalls, this.roomTint, this.dirt, this.doorGroup, this.labels);
  }

  /** Houses and trees across the street and round the plot, for context. */
  private addNeighbourhood() {
    const house = (x: number, z: number, w: number, d: number, h: number, color: string, roof: string) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      body.position.y = h / 2;
      const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.2, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: roof, roughness: 0.8 }));
      r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
      r.position.y = h + 1.1;
      body.castShadow = r.castShadow = true;
      g.add(body, r);
      g.position.set(x, 0, z);
      this.group.add(g);
    };
    const colors = ["#e8dcc0", "#c9d6df", "#f2d0a9", "#d8c3e8", "#cfe3c4"];
    for (let i = 0; i < 9; i++) house(-6 + i * 9, H + 6, 6, 6, 4 + (i % 3), colors[i % colors.length], i % 2 ? "#8b3a2b" : "#4b5563");
    const trunk = new THREE.MeshStandardMaterial({ color: "#6b4a2f" });
    const leaf = new THREE.MeshStandardMaterial({ color: "#3f7f2f", roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const side = i % 3;
      const x = side === 0 ? -4 - (i % 2) * 2 : side === 1 ? W + 4 + (i % 2) * 2 : 4 + i * 2.6;
      const z = side === 2 ? -4 : 3 + ((i * 7) % 38);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4), trunk);
      t.position.set(x, 0.7, z);
      const c = new THREE.Mesh(new THREE.SphereGeometry(1.1 + (i % 3) * 0.25, 10, 8), leaf);
      c.position.set(x, 2.1, z);
      t.castShadow = c.castShadow = true;
      this.group.add(t, c);
    }
  }

  /** At night the lights are on inside: floors and walls glow a little. */
  setNight(n: number) {
    for (const [id, mesh] of this.floors) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (!m.emissiveMap) {
        m.emissive = new THREE.Color("#fff3d6");
        m.emissiveMap = floorTexture(id);
        m.needsUpdate = true;
      }
      m.emissiveIntensity = n * 0.55;
    }
    this.wallMat.emissive.set("#fff3d6");
    this.wallMat.emissiveIntensity = n * 0.25;
  }

  setCutaway(on: boolean) {
    this.cutaway = on;
    this.version = -1;
  }

  /** Rebuild meshes from the world when it changed. */
  sync(w: World) {
    if (w.version === this.version) return;
    this.version = w.version;
    const m = new THREE.Matrix4();
    const counts = new Map<FloorId, number>();
    for (const [, mesh] of this.floors) mesh.count = 0;
    let pf = 0;
    let wl = 0;
    let pw = 0;
    let rt = 0;
    const wallH = this.cutaway ? CUT_H : WALL_H;
    const color = new THREE.Color();
    const seenDoors = new Set<number>();
    for (let i = 0; i < N; i++) {
      const x = cx(i) + 0.5;
      const z = cz(i) + 0.5;
      const f = w.floorAt(i);
      if (f) {
        const mesh = this.floors.get(f)!;
        const n = counts.get(f) ?? 0;
        m.makeTranslation(x, 0.02, z);
        mesh.setMatrixAt(n, m);
        counts.set(f, n + 1);
      } else if (w.floorPlan[i]) {
        m.makeTranslation(x, 0.025, z);
        this.planFloors.setMatrixAt(pf++, m);
      }
      if (w.door[i]) {
        seenDoors.add(i);
        this.ensureDoor(w, i, wallH);
      } else if (w.wall[i] === BUILT) {
        m.makeScale(1, wallH, 1).setPosition(x, 0, z);
        this.walls.setMatrixAt(wl, m);
        m.makeTranslation(x, wallH + 0.03, z);
        this.wallTops.setMatrixAt(wl++, m);
      } else if (w.wall[i] === PLANNED) {
        m.makeScale(0.96, wallH, 0.96).setPosition(x, 0, z);
        this.planWalls.setMatrixAt(pw++, m);
      }
      const room = w.roomAt(i);
      if (room && this.roomsVisible && !w.wall[i]) {
        m.makeTranslation(x, 0.04, z);
        this.roomTint.setMatrixAt(rt, m);
        this.roomTint.setColorAt(rt++, color.set(ROOMS[room].color));
      }
    }
    for (const [f, n] of counts) {
      const mesh = this.floors.get(f)!;
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [this.planFloors, this.walls, this.wallTops, this.planWalls, this.roomTint]) mesh.instanceMatrix.needsUpdate = true;
    this.planFloors.count = pf;
    this.walls.count = wl;
    this.wallTops.count = wl;
    this.planWalls.count = pw;
    this.roomTint.count = rt;
    if (this.roomTint.instanceColor) this.roomTint.instanceColor.needsUpdate = true;
    for (const [i, d] of this.doors)
      if (!seenDoors.has(i)) {
        this.doorGroup.remove(d.g);
        this.doors.delete(i);
      }
    this.syncLabels(w);
  }

  private ensureDoor(w: World, i: number, wallH: number) {
    const planned = w.door[i] === PLANNED;
    const existing = this.doors.get(i);
    const key = `${planned}:${wallH}`;
    if (existing && existing.g.userData.key === key) return;
    if (existing) this.doorGroup.remove(existing.g);
    const x = cx(i);
    const z = cz(i);
    const solid = (xx: number, zz: number) => inside(xx, zz) && !!w.wall[idx(xx, zz)];
    const alongX = solid(x - 1, z) || solid(x + 1, z);
    const g = new THREE.Group();
    g.userData.key = key;
    const frameMat = planned ? BLUEPRINT : new THREE.MeshStandardMaterial({ color: "#9aa3ad", roughness: 0.6 });
    const leafMat = planned ? BLUEPRINT : new THREE.MeshStandardMaterial({ color: "#5fb3c9", roughness: 0.4, metalness: 0.1 });
    const h = Math.min(2.2, wallH + 0.6);
    for (const s of [-0.47, 0.47]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.24), frameMat);
      post.position.set(s, h / 2, 0);
      g.add(post);
    }
    if (!this.cutaway) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H - 2.2, 1), this.wallMat);
      top.position.y = 2.2 + (WALL_H - 2.2) / 2;
      g.add(top);
    }
    const pivot = new THREE.Group();
    pivot.position.set(-0.43, 0, 0);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.86, Math.min(2.1, h - 0.05), 0.06), leafMat);
    leaf.position.set(0.43, leaf.geometry.parameters.height / 2, 0);
    leaf.castShadow = true;
    pivot.add(leaf);
    g.add(pivot);
    g.position.set(x + 0.5, 0, z + 0.5);
    if (!alongX) g.rotation.y = Math.PI / 2;
    this.doorGroup.add(g);
    this.doors.set(i, { g, leaf: pivot, open: 0, alongX });
  }

  private labelVersion = -1;
  private syncLabels(w: World) {
    for (const c of [...this.labels.children]) {
      this.labels.remove(c);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).map?.dispose();
    }
    if (!this.roomsVisible) return;
    for (const r of w.rooms) {
      const def = ROOMS[r.type];
      const { tex, aspect } = labelTexture(def.name, def.color, !r.valid);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      s.scale.set(aspect * 0.55, 0.55, 1);
      s.position.set(r.x, 2.9, r.z);
      s.renderOrder = 20;
      s.userData.room = r.id;
      this.labels.add(s);
    }
    this.labelVersion = w.version;
  }

  /** Doors swing toward anyone within a cell; dirt shows as smudges. */
  update(w: World, people: Iterable<{ x: number; z: number }>, dt: number, dirtNow: boolean) {
    const near = new Set<number>();
    for (const p of people) {
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.floor(p.x) + dx;
          const z = Math.floor(p.z) + dz;
          if (Math.abs(p.x - (x + 0.5)) < 1.1 && Math.abs(p.z - (z + 0.5)) < 1.1 && inside(x, z)) near.add(idx(x, z));
        }
    }
    for (const [i, d] of this.doors) {
      const want = near.has(i) && w.door[i] === BUILT ? 1 : 0;
      d.open += (want - d.open) * Math.min(1, dt * 8);
      d.leaf.rotation.y = -d.open * 1.45;
    }
    if (!dirtNow) return;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < N; i++) {
      const d = w.dirt[i];
      if (d < 0.12 || !w.found[i]) continue;
      const s = 0.4 + d * 0.8;
      m.makeRotationY((i * 2.3) % 6.28);
      m.scale(new THREE.Vector3(s, 1, s));
      m.setPosition(cx(i) + 0.5, 0.045, cz(i) + 0.5);
      this.dirt.setMatrixAt(n++, m);
    }
    this.dirt.count = n;
    this.dirt.instanceMatrix.needsUpdate = true;
    void this.labelVersion;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}
