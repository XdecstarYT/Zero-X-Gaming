/**
 * The debating chamber in 3D: tiers of polished walnut desks in a horseshoe on a deep carpet
 * (or, Westminster style, green and red benches facing each other across the table), leather
 * chairs, every member at their seat (in their party's tie), the Speaker's dais with the
 * country's flags and seal, a coffered dome with an oculus, and the electronic vote board. Each
 * seat has a voting lamp that lights green, red or white as the votes come in. Any size of
 * house fits: rows are added and the figures scaled down as it grows.
 *
 * Members are instanced (a few draw calls for the whole House); textures are drawn on canvases.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Rig } from "./rig";

export interface Member {
  id: number;
  party: string;
  /** Tie colour (the party's). */
  color: string;
  /** Where the party sits left to right (its economic position). */
  e: number;
  /** Westminster: 1 government benches, -1 opposition, 0 crossbenches. */
  side?: number;
  face: number;
  you?: boolean;
}

export interface ChamberStyle {
  /** Board titles for the two houses. */
  names: { house: string; senate: string };
  layout: "hemicycle" | "westminster";
  /** The seal on the far wall. */
  seal: { title: string; sub: string; year: string };
  /** The country's flag (an image URL) for the flags by the dais. */
  flag: string;
}

export interface ChamberVote {
  title: string;
  by: Record<number, number>;
  yes: number;
  no: number;
  abstain: number;
  passed: boolean | null;
}

const SKIN = ["#f1d0b5", "#e0b08e", "#c58c62", "#a26a43", "#7a4b2e", "#f6dcc8"];
const HAIR = ["#2b2118", "#5a3a22", "#a8722f", "#d9b25a", "#8a8a8a", "#ece6dc", "#b2462c", "#1d1d1d"];
const SUITS = ["#1f2733", "#2a2f38", "#3a3f47", "#1c2230", "#4a4237", "#2e3a4d", "#38302c"];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Walnut: long grain with darker figure. */
function woodTexture() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = "#5a3520";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * 512;
      g.strokeStyle = `rgba(${30 + Math.random() * 40},${15 + Math.random() * 20},${8 + Math.random() * 10},${0.15 + Math.random() * 0.3})`;
      g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 4 + (Math.random() - 0.5) * 2);
      g.stroke();
    }
    const grd = g.createLinearGradient(0, 0, 512, 0);
    grd.addColorStop(0, "rgba(255,200,150,0.05)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.06)");
    grd.addColorStop(1, "rgba(255,200,150,0.05)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });
}

/** The chamber carpet: deep colour with a small woven motif. */
function carpetTexture(base: string, motif: string) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    g.strokeStyle = motif;
    g.lineWidth = 2;
    for (let y = 0; y < 256; y += 64)
      for (let x = 0; x < 256; x += 64) {
        g.beginPath();
        g.moveTo(x + 32, y + 18);
        g.lineTo(x + 46, y + 32);
        g.lineTo(x + 32, y + 46);
        g.lineTo(x + 18, y + 32);
        g.closePath();
        g.stroke();
      }
  });
}

/** Parquet for the floor of the well. */
function parquetTexture() {
  return canvasTex(512, 512, (g) => {
    for (let y = 0; y < 512; y += 32)
      for (let x = 0; x < 512; x += 128) {
        const off = (y / 32) % 2 ? 64 : 0;
        const l = 38 + Math.random() * 18;
        g.fillStyle = `hsl(28, 45%, ${l}%)`;
        g.fillRect(x + off - 128, y, 127, 31);
        g.fillRect(x + off, y, 127, 31);
      }
    g.strokeStyle = "rgba(20,10,0,0.35)";
    for (let y = 0; y <= 512; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y);
      g.stroke();
    }
  });
}

/** Wall panelling: wood below, warm plaster above, with fluted pilasters. */
function wallTexture() {
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = "#e9dfcc";
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#5a3520";
    g.fillRect(0, 300, 1024, 212);
    for (let x = 0; x < 1024; x += 128) {
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.strokeRect(x + 10, 318, 108, 170);
      g.fillStyle = "#d9cdb5";
      g.fillRect(x + 54, 0, 20, 300);
      g.fillStyle = "rgba(0,0,0,0.08)";
      for (let k = 0; k < 4; k++) g.fillRect(x + 56 + k * 5, 0, 2, 300);
    }
    g.fillStyle = "#c9a227";
    g.fillRect(0, 296, 1024, 6);
  });
}

/** A seal for the wall behind the Speaker. */
function sealTexture(seal: ChamberStyle["seal"]) {
  return canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const cx = 256;
    g.fillStyle = "#b8901e";
    g.beginPath();
    g.arc(cx, cx, 240, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#24408e";
    g.beginPath();
    g.arc(cx, cx, 214, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#e8c860";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cx, 170, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#e8c860";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * 192, cx + Math.sin(a) * 192, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = "center";
    const title = seal.title.toUpperCase();
    g.font = `bold ${Math.min(46, Math.floor(560 / Math.max(6, title.length)))}px Georgia, serif`;
    g.fillText(title, cx, cx + 16);
    g.font = "bold 22px Georgia, serif";
    g.fillText(seal.sub.toUpperCase().slice(0, 22), cx, cx - 50);
    g.fillText(seal.year, cx, cx + 70);
  });
}

/** Roman numerals for the seal's year. */
export function roman(n: number) {
  const t: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, r] of t)
    while (n >= v) {
      out += r;
      n -= v;
    }
  return out;
}

/** A curved slab: a ring segment from r0 to r1, angles a0..a1, heights y0..y1 (center at origin). */
function arcBox(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, segs = 32) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r1, a0, a1, false);
  shape.absarc(0, 0, r0, a1, a0, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: segs });
  // Shape is in x/y; lay it flat (y up) with angle 0 along +x and π/2 toward -z.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}

export class ChamberView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  readonly rig: Rig;
  private members: THREE.Group | null = null;
  private lamps: THREE.InstancedMesh | null = null;
  private seatOf = new Map<number, number>();
  private lampOn: { at: number; color: THREE.Color }[] = [];
  private board: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D } | null = null;
  private time = 0;
  private builtFor = "";
  private kind: "house" | "senate" = "house";
  private wood = woodTexture();
  private style: ChamberStyle = { names: { house: "House of Representatives", senate: "Senate" }, layout: "hemicycle", seal: { title: "Avalon", sub: "Federation", year: "MMXLVI" }, flag: "" };
  private seal: THREE.Mesh | null = null;
  private flagMats: THREE.MeshStandardMaterial[] = [];
  private styleKey = "";

  constructor(private quality: "high" | "low") {
    this.rig = new Rig({ minDist: 8, maxDist: 25, minPitch: 0.15, maxPitch: 1.25, yaw: [-1.2, 1.2] }, { target: new THREE.Vector3(0, 1.2, -6.5), dist: 21, yaw: 0.32, pitch: 0.6 });
    this.buildRoom();
  }

  bakeEnvironment(renderer: THREE.WebGLRenderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  // ------------------------------------------------------------------ the room

  private buildRoom() {
    const s = this.scene;
    s.background = new THREE.Color("#1d1a17");
    s.fog = new THREE.Fog("#1d1a17", 40, 90);
    const hi = this.quality === "high";

    // Floor of the well (parquet) and the outer floor.
    const parquet = parquetTexture();
    parquet.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.38, metalness: 0, envMapIntensity: 0.8 }));
    floor.receiveShadow = hi;
    s.add(floor);

    // The round wall: walnut panelling below, warm plaster and pilasters above.
    const wt = wallTexture();
    wt.repeat.set(12, 1);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 11, 96, 1, true), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.75, side: THREE.BackSide }));
    wall.position.y = 5.5;
    s.add(wall);

    // The dome, coffered, with a bright oculus.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(20, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: canvasTex(512, 256, (g) => {
          g.fillStyle = "#efe6d6";
          g.fillRect(0, 0, 512, 256);
          g.strokeStyle = "rgba(120,96,60,0.45)";
          g.lineWidth = 3;
          for (let x = 0; x <= 512; x += 32) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, 256);
            g.stroke();
          }
          for (let y = 0; y <= 256; y += 28) {
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(512, y);
            g.stroke();
          }
        }),
        side: THREE.BackSide,
        roughness: 0.9,
      }),
    );
    dome.position.y = 11;
    dome.scale.set(1.05, 0.55, 1.05);
    s.add(dome);
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4) }));
    oculus.position.y = 21.9;
    s.add(oculus);

    // The Speaker's dais: a raised platform, a long curved desk, the chair, two flags and the seal.
    const dais = new THREE.Mesh(new THREE.BoxGeometry(12, 0.9, 3.4), new THREE.MeshStandardMaterial({ map: this.wood, roughness: 0.4 }));
    dais.position.set(0, 0.45, 4.2);
    dais.receiveShadow = hi;
    dais.castShadow = hi;
    s.add(dais);
    const deskMat = new THREE.MeshPhysicalMaterial({ map: this.wood, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const speakerDesk = new THREE.Mesh(arcBox(7.2, 7.8, Math.PI * 0.42, Math.PI * 0.58, 0.9, 2.15), deskMat);
    // Centred behind the Speaker, so the desk bows out toward the members.
    speakerDesk.position.z = 10.8;
    speakerDesk.castShadow = hi;
    s.add(speakerDesk);
    // The Speaker's chair: a tall, buttoned leather back under a carved crest.
    const leather = new THREE.MeshStandardMaterial({ color: "#5b1a1a", roughness: 0.5 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.18), leather);
    back.position.set(0, 2.05, 5.25);
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ map: this.wood, roughness: 0.4 }));
    crest.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    crest.position.set(0, 2.9, 5.25);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.75), leather);
    seat.position.set(0, 1.35, 4.95);
    s.add(back, crest, seat);
    // The seal of the Federation high on the far wall, facing the Speaker.
    const seal = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshStandardMaterial({ map: sealTexture(this.style.seal), transparent: true, roughness: 0.4, metalness: 0.3 }));
    seal.position.set(0, 8.3, -20.85);
    s.add(seal);
    this.seal = seal;
    for (const x of [-4.6, 4.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 12), new THREE.MeshStandardMaterial({ color: "#c9a227", metalness: 0.9, roughness: 0.3 }));
      pole.position.set(x, 3.4, 5.4);
      s.add(pole);
      const flagMat = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        roughness: 0.8,
        map: canvasTex(192, 128, (g) => {
          g.fillStyle = "#24408e";
          g.fillRect(0, 0, 192, 128);
          g.fillStyle = "#f4f4f4";
          g.fillRect(0, 42, 192, 44);
          g.fillStyle = "#d6a520";
          g.beginPath();
          g.arc(96, 64, 22, 0, Math.PI * 2);
          g.fill();
        }),
      });
      this.flagMats.push(flagMat);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 12, 6), flagMat);
      // A gentle drape.
      const p = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + 0.75) * 3) * 0.08 * (p.getX(i) + 0.75));
      flag.geometry.computeVertexNormals();
      flag.position.set(x + (x < 0 ? 0.78 : -0.78), 5.2, 5.4);
      flag.rotation.y = Math.PI;
      s.add(flag);
    }

    // The vote board above the Speaker.
    const bc = document.createElement("canvas");
    bc.width = 1024;
    bc.height = 320;
    const bg = bc.getContext("2d")!;
    const tex = new THREE.CanvasTexture(bc);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.board = { tex, g: bg };
    // Two vote boards on the far wall, either side of the seal.
    for (const x of [-6.2, 6.2]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.62), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const a = Math.asin(x / 20.6);
      board.position.set(x, 8.2, -Math.cos(a) * 20.6);
      board.rotation.y = -a;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.9, 0.12), new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.5, metalness: 0.4 }));
      // Just behind the screen, toward the wall.
      frame.position.copy(board.position).add(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(0.08));
      frame.rotation.y = -a;
      s.add(frame, board);
    }
    this.drawBoard(null);

    // Light: the oculus from above, warm lamps round the walls, soft fill from the room.
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(4, 24, 6);
    key.target.position.set(0, 0, -6);
    if (hi) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const c = key.shadow.camera as THREE.OrthographicCamera;
      c.left = -22;
      c.right = 22;
      c.top = 22;
      c.bottom = -22;
      c.near = 1;
      c.far = 60;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.02;
    }
    s.add(key, key.target);
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x3a2a1c, 0.7));
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.1 + (0.8 * i) / 5);
      const l = new THREE.PointLight(0xffd9a0, 22, 18, 2);
      l.position.set(Math.cos(a) * 17, 7.5, -Math.sin(a) * 17);
      s.add(l);
    }
    const front2 = new THREE.SpotLight(0xffffff, 120, 50, 0.7, 0.6, 1.6);
    front2.position.set(0, 12, 8);
    front2.target.position.set(0, 0, -6);
    s.add(front2, front2.target);
  }

  /** The electronic board: the motion and the running tally. */
  private drawBoard(v: ChamberVote | null, shown = 1) {
    if (!this.board) return;
    const g = this.board.g;
    g.fillStyle = "#050806";
    g.fillRect(0, 0, 1024, 320);
    g.fillStyle = "#ffb000";
    g.font = "bold 40px 'Courier New', monospace";
    g.textAlign = "center";
    if (!v) {
      const name = (this.kind === "house" ? this.style.names.house : this.style.names.senate).toUpperCase();
      g.font = `bold ${Math.min(40, Math.floor(1700 / Math.max(10, name.length)))}px 'Courier New', monospace`;
      g.fillText(name, 512, 120);
      g.fillStyle = "#9a7a20";
      g.font = "bold 30px 'Courier New', monospace";
      g.fillText("IN SESSION", 512, 200);
    } else {
      g.fillText(v.title.toUpperCase().slice(0, 40), 512, 70);
      const yes = Math.round(v.yes * shown);
      const no = Math.round(v.no * shown);
      const ab = Math.round(v.abstain * shown);
      g.font = "bold 74px 'Courier New', monospace";
      g.fillStyle = "#38e070";
      g.fillText(`AYE ${yes}`, 200, 190);
      g.fillStyle = "#ff4d4d";
      g.fillText(`NO ${no}`, 820, 190);
      g.fillStyle = "#d8d8d8";
      g.font = "bold 40px 'Courier New', monospace";
      g.fillText(`ABST ${ab}`, 512, 180);
      if (shown >= 1 && v.passed !== null) {
        g.fillStyle = v.passed ? "#38e070" : "#ff4d4d";
        g.font = "bold 46px 'Courier New', monospace";
        g.fillText(v.passed ? "MOTION CARRIED" : "MOTION DEFEATED", 512, 280);
      }
    }
    this.board.tex.needsUpdate = true;
  }

  /** The country's chamber: names on the board, the layout, the seal and the flags. */
  setStyle(st: ChamberStyle) {
    const key = JSON.stringify(st);
    if (key === this.styleKey) return;
    this.styleKey = key;
    const was = this.style.layout;
    this.style = st;
    this.builtFor = "";
    // Westminster is best seen from behind the Speaker's chair, down the length of the chamber.
    if (was !== st.layout)
      this.rig.jump(st.layout === "westminster" ? { target: new THREE.Vector3(0, 0.8, -5.5), dist: 15, yaw: 0.18, pitch: 0.5 } : { target: new THREE.Vector3(0, 1.2, -6.5), dist: 21, yaw: 0.32, pitch: 0.6 });
    if (this.seal) {
      const m = this.seal.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.map = sealTexture(st.seal);
      m.needsUpdate = true;
    }
    if (st.flag && typeof Image !== "undefined") {
      const img = new Image();
      img.onload = () => {
        for (const mat of this.flagMats) {
          const t = canvasTex(192, 128, (g) => g.drawImage(img, 0, 0, 192, 128));
          mat.map?.dispose();
          mat.map = t;
          mat.needsUpdate = true;
        }
      };
      img.src = st.flag;
    }
    this.drawBoard(null);
  }

  // ------------------------------------------------------------------ the members

  /** Seat a house: tiers of desks sized to fit, and everyone at their seat by party. */
  setMembers(kind: "house" | "senate", members: Member[]) {
    const key = `${kind}|${members.map((m) => `${m.id}:${m.party}`).join(",")}`;
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.kind = kind;
    if (this.members) {
      this.scene.remove(this.members);
      this.members.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        if (m.material && !Array.isArray(m.material)) m.material.dispose();
      });
    }
    const group = new THREE.Group();
    this.members = group;
    this.scene.add(group);
    const hi = this.quality === "high";

    const west = this.style.layout === "westminster";
    // Seats: each with a position, a height and the way the member faces.
    type Slot = { x: number; y: number; z: number; yaw: number };
    const slots: Slot[] = [];
    let sorted: Member[];
    let sc = 1;
    const carpet = carpetTexture(kind === "house" ? "#1f4a3a" : "#6b1f26", kind === "house" ? "rgba(214,180,90,0.35)" : "rgba(230,190,110,0.35)");
    carpet.repeat.set(10, 10);
    const tierMat = new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 });
    const deskMat = new THREE.MeshPhysicalMaterial({ map: this.wood, roughness: 0.33, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const topMat = new THREE.MeshStandardMaterial({ color: "#2b1a10", roughness: 0.5 });
    if (west) {
      // Government benches on the Speaker's right, the opposition facing them, crossbenches at the far end.
      const gov = members.filter((m) => (m.side ?? 0) > 0).sort((a, b) => b.e - a.e || a.id - b.id);
      const opp = members.filter((m) => (m.side ?? 0) < 0).sort((a, b) => a.e - b.e || a.id - b.id);
      const cross = members.filter((m) => !m.side).sort((a, b) => a.e - b.e || a.id - b.id);
      const most = Math.max(gov.length, opp.length, 1);
      const rows = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(most / 12))));
      const len = 19;
      const per = Math.ceil(most / rows);
      sc = Math.max(0.42, Math.min(1, len / per / 0.78));
      const benchMat = new THREE.MeshStandardMaterial({ color: kind === "house" ? "#2f6b48" : "#8a2430", roughness: 0.55 });
      const rowW = 1.25 * Math.max(0.7, sc);
      const lay = (list: Member[], dir: number) => {
        for (let k = 0; k < rows; k++) {
          const x = dir * (2.7 + k * rowW);
          const y = k * 0.42;
          // The step the row stands on, a long leather bench and its back.
          if (y > 0) {
            const tier = new THREE.Mesh(new THREE.BoxGeometry(rowW, y, len + 1), tierMat);
            tier.position.set(x, y / 2, -7);
            tier.receiveShadow = hi;
            group.add(tier);
          }
          const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55 * Math.max(0.7, sc), 0.42 * sc, len + 0.6), benchMat);
          seat.position.set(x + dir * 0.06, y + 0.21 * sc, -7);
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62 * sc, len + 0.6), benchMat);
          back.position.set(x + dir * (0.06 + 0.3 * Math.max(0.7, sc)), y + 0.52 * sc, -7);
          for (const b of [seat, back]) {
            b.castShadow = hi;
            b.receiveShadow = hi;
            group.add(b);
          }
        }
        list.forEach((m, i) => {
          const k = i % rows;
          const j = Math.floor(i / rows);
          slots.push({ x: dir * (2.7 + k * rowW), y: k * 0.42 - 0.12 * sc, z: 2.2 - (j + 0.5) * (len / per), yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2 });
        });
      };
      lay(gov, 1);
      lay(opp, -1);
      // The crossbenches: rows across the far end, facing the Speaker.
      const cPer = Math.max(1, Math.ceil(cross.length / 3));
      cross.forEach((_, i) => {
        const k = Math.floor(i / cPer);
        const j = i % cPer;
        slots.push({ x: ((j + 0.5) / cPer - 0.5) * 4.6, y: k * 0.45 - 0.2, z: -17.6 - k * 1.1, yaw: 0 });
      });
      sorted = [...gov, ...opp, ...cross];
      // The table of the house, with the mace.
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 5.2), deskMat);
      table.position.set(0, 0.42, 0.2);
      table.castShadow = hi;
      const mace = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 12), new THREE.MeshStandardMaterial({ color: "#d4a62a", metalness: 0.9, roughness: 0.25 }));
      mace.rotation.x = Math.PI / 2;
      mace.position.set(0, 0.92, 0.2);
      group.add(table, mace);
    } else {
      // Order round the horseshoe: left-wing parties on the Speaker's left.
      sorted = [...members].sort((a, b) => a.e - b.e || a.party.localeCompare(b.party) || a.id - b.id);
      const n = sorted.length;
      const rows = Math.max(3, Math.min(9, Math.round(Math.sqrt(n / 11))));
      const r0 = 6.8;
      const gap = rows > 6 ? 1.45 : 1.65;
      const lens = Array.from({ length: rows }, (_, k) => r0 + k * gap);
      const tot = lens.reduce((a, b) => a + b, 0);
      sc = Math.max(0.42, Math.min(1, (tot * Math.PI * 0.88) / Math.max(1, n) / 0.78));
      let left = n;
      const per = lens.map((l, k) => {
        const c = k === rows - 1 ? left : Math.round((n * l) / tot);
        left -= c;
        return c;
      });
      const A0 = Math.PI * 0.06;
      const A1 = Math.PI * 0.94;
      const arcSlots: { k: number; a: number }[] = [];
      per.forEach((c, k) => {
        for (let j = 0; j < c; j++) arcSlots.push({ k, a: A0 + ((A1 - A0) * (j + 0.5)) / c });
      });
      // Fill angle by angle across the rows, so each party sits in a wedge.
      arcSlots.sort((p, q) => q.a - p.a);
      for (const sl of arcSlots) {
        const r = lens[sl.k] + 0.05;
        const cx = Math.cos(sl.a);
        const cz = -Math.sin(sl.a);
        slots.push({ x: cx * r, y: sl.k * 0.42, z: cz * r, yaw: Math.atan2(-cx, -cz) });
      }
      // Tiers and desks.
      for (let k = 0; k < rows; k++) {
        const r = lens[k];
        const y = k * 0.42;
        const tier = new THREE.Mesh(arcBox(r - 0.95, r + 0.85, A0 - 0.06, A1 + 0.06, 0, y + 0.02, 48), tierMat);
        tier.receiveShadow = hi;
        group.add(tier);
        const desk = new THREE.Mesh(arcBox(r - 0.8, r - 0.42, A0 - 0.03, A1 + 0.03, y, y + 0.78 * Math.max(0.7, sc), 48), deskMat);
        desk.castShadow = hi;
        desk.receiveShadow = hi;
        group.add(desk);
        const top = new THREE.Mesh(arcBox(r - 0.86, r - 0.3, A0 - 0.03, A1 + 0.03, y + 0.78 * Math.max(0.7, sc), y + 0.82 * Math.max(0.7, sc), 48), topMat);
        top.receiveShadow = hi;
        group.add(top);
      }
    }

    // The people: instanced bodies, heads, hair, arms, shirts and ties; chairs behind them.
    const n = sorted.length;
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = hi;
      m.receiveShadow = hi;
      group.add(m);
      return m;
    };
    const torso = inst(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    const shirt = inst(new THREE.BoxGeometry(0.16, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: "#f2f2f0", roughness: 0.7 }));
    const tie = inst(new THREE.BoxGeometry(0.06, 0.28, 0.03), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
    const head = inst(new THREE.SphereGeometry(0.135, 20, 16), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    const hair = inst(new THREE.SphereGeometry(0.145, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    const arm = new THREE.CapsuleGeometry(0.07, 0.36, 4, 8);
    const armL = inst(arm, new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    const armR = inst(arm.clone(), new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    const chairGeo = new THREE.BoxGeometry(0.62, 0.95, 0.12);
    chairGeo.translate(0, 0.47, 0);
    const chairs = inst(chairGeo, new THREE.MeshStandardMaterial({ color: kind === "house" ? "#1d5a43" : "#7a2028", roughness: 0.5 }));
    // Westminster benches need no chairs.
    chairs.visible = !west;
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    group.add(lamps);
    this.lamps = lamps;
    const mic = inst(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6), new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.7, roughness: 0.3 }));

    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();
    const P = new THREE.Vector3();
    const S = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1) => {
      E.set(pitch, yaw, roll, "YXZ");
      Q.setFromEuler(E);
      P.set(x, y, z);
      S.set(sx, sy, sz);
      M.compose(P, Q, S);
      mesh.setMatrixAt(i, M);
    };
    this.seatOf.clear();
    this.lampOn = [];
    sorted.forEach((m, i) => {
      const sl = slots[i] ?? slots[slots.length - 1] ?? { x: 0, y: 0, z: 0, yaw: 0 };
      const { x, y, z, yaw } = sl;
      // Facing the way the seat faces.
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const k = sc;
      put(chairs, i, x - fx * 0.25 * k, y, z - fz * 0.25 * k, yaw, 0, 0, k, k, k);
      put(torso, i, x, y + 0.82 * k, z, yaw, 0.1, 0, k, k, k);
      put(shirt, i, x + fx * 0.2 * k, y + 0.98 * k, z + fz * 0.2 * k, yaw, 0.1, 0, k, k, k);
      put(tie, i, x + fx * 0.225 * k, y + 0.95 * k, z + fz * 0.225 * k, yaw, 0.1, 0, k, k, k);
      put(head, i, x + fx * 0.03 * k, y + 1.38 * k, z + fz * 0.03 * k, yaw, 0, 0, 0.95 * k, 1.08 * k, k);
      const longHair = Math.floor(m.face / 53) % 3 === 0;
      put(hair, i, x - fx * 0.005 * k, y + 1.4 * k, z - fz * 0.005 * k, yaw, -0.25, 0, k, (longHair ? 1.25 : 1) * k, k);
      // Forearms resting on the desk (or the knees, on a bench).
      const side = { x: -fz, z: fx };
      put(armL, i, x + fx * 0.28 * k + side.x * 0.22 * k, y + 0.86 * k, z + fz * 0.28 * k + side.z * 0.22 * k, yaw, Math.PI / 2 - 0.25, 0, k, k, k);
      put(armR, i, x + fx * 0.28 * k - side.x * 0.22 * k, y + 0.86 * k, z + fz * 0.28 * k - side.z * 0.22 * k, yaw, Math.PI / 2 - 0.25, 0, k, k, k);
      put(lamps, i, x + fx * (west ? 0.42 : 0.6) * k + side.x * 0.18 * k, y + (west ? 1.75 : 0.84) * k, z + fz * (west ? 0.42 : 0.6) * k + side.z * 0.18 * k, yaw, 0, 0, k, k, k);
      put(mic, i, x + fx * 0.62 * k - side.x * 0.1 * k, y + 0.98 * k, z + fz * 0.62 * k - side.z * 0.1 * k, yaw, -0.6, 0, k, west ? 0.001 : k, k);
      const suit = col.set(SUITS[(m.face >> 3) % SUITS.length]);
      torso.setColorAt(i, suit);
      armL.setColorAt(i, suit);
      armR.setColorAt(i, suit);
      tie.setColorAt(i, col.set(m.color));
      head.setColorAt(i, col.set(SKIN[m.face % SKIN.length]));
      hair.setColorAt(i, col.set(HAIR[Math.floor(m.face / 7) % HAIR.length]));
      lamps.setColorAt(i, col.setRGB(0.15, 0.15, 0.15));
      this.seatOf.set(m.id, i);
      this.lampOn.push({ at: Infinity, color: new THREE.Color(0.15, 0.15, 0.15) });
      // You: a gold pin catches the light.
      if (m.you) tie.setColorAt(i, col.set("#f5b335"));
    });
    for (const m of group.children) if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
    this.drawBoard(null);
  }

  /** Light the desk lamps for a vote (one by one if animated). */
  setVote(v: ChamberVote | null, animate: boolean) {
    this.vote = v;
    this.voteT = animate ? 0 : 999;
    const now = this.time;
    for (const L of this.lampOn) L.at = Infinity;
    if (!v) {
      for (let i = 0; i < this.lampOn.length; i++) {
        this.lampOn[i].color.setRGB(0.15, 0.15, 0.15);
        this.lampOn[i].at = now;
      }
      this.drawBoard(null);
      return;
    }
    for (const [id, val] of Object.entries(v.by)) {
      const i = this.seatOf.get(Number(id));
      if (i === undefined) continue;
      const L = this.lampOn[i];
      L.color.setRGB(val > 0 ? 0.15 : val < 0 ? 2.2 : 1.6, val > 0 ? 2.0 : val < 0 ? 0.18 : 1.6, val > 0 ? 0.35 : val < 0 ? 0.15 : 1.6);
      L.at = now + (animate ? 0.2 + Math.random() * 2.2 : 0);
    }
  }
  private vote: ChamberVote | null = null;
  private voteT = 999;

  update(dt: number) {
    this.time += dt;
    this.rig.step(dt, this.camera);
    if (this.lamps) {
      let dirty = false;
      for (let i = 0; i < this.lampOn.length; i++) {
        const L = this.lampOn[i];
        if (L.at <= this.time) {
          this.lamps.setColorAt(i, L.color);
          L.at = Infinity;
          dirty = true;
        }
      }
      if (dirty && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    }
    if (this.vote && this.voteT < 3) {
      this.voteT += dt;
      this.drawBoard(this.vote, Math.min(1, this.voteT / 2.4));
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.scene.environment?.dispose();
  }
}
