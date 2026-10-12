import type * as THREE from "three";
import { VEHICLES, type StationId } from "./data";
import { playerCar, playerPos, speedOf, type State } from "./state";

/**
 * Heatwave's sound, all synthesised with Web Audio: your engine (pitch with the revs, gears),
 * sirens that wail and fade with distance, gunfire by weapon, crashes, explosions, punches and
 * glass; little stings for wanted, lost, passed and failed; and four radio stations playing
 * sequenced music in the car: synthwave, reggaeton, lo-fi and trap.
 */

type Note = { t: number; f: number; d: number; v: number; kind: "bass" | "lead" | "pad" | "pluck" | "keys" | "sub" };

interface Style {
  bpm: number;
  swing: number;
  /** Chord roots (semitones from A2 = 110 Hz), one per bar. */
  prog: number[];
  minor: boolean;
  kick: number[];
  snare: number[];
  hat: number[];
  /** Per 16th: which instruments play. */
  bass: (step: number, root: number) => Note[];
  top: (step: number, root: number, bar: number) => Note[];
}

const A2 = 110;
const f = (semi: number) => A2 * Math.pow(2, semi / 12);
const MIN = [0, 3, 7, 10, 12, 15];
const MAJ = [0, 4, 7, 11, 12, 16];

const STYLES: Record<Exclude<StationId, "off">, Style> = {
  neon: {
    bpm: 102,
    swing: 0,
    prog: [0, -4, 3, -2],
    minor: true,
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    bass: (st, r) => (st % 2 === 0 ? [{ t: 0, f: f(r - 12 + (st % 4 === 2 ? 12 : 0)), d: 0.18, v: 0.5, kind: "bass" }] : []),
    top: (st, r, bar) => {
      const chord = bar % 2 ? MIN : [0, 3, 7, 12, 10, 15];
      const out: Note[] = [{ t: 0, f: f(r + 12 + chord[st % chord.length]), d: 0.12, v: 0.16, kind: "lead" }];
      if (st === 0) for (const c of [0, 3, 7]) out.push({ t: 0, f: f(r + c), d: 2.2, v: 0.08, kind: "pad" });
      return out;
    },
  },
  calle: {
    bpm: 94,
    swing: 0,
    prog: [0, 5, 3, -2],
    minor: true,
    kick: [0, 4, 8, 12],
    snare: [3, 6, 11, 14],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bass: (st, r) => (st === 0 || st === 6 || st === 8 || st === 14 ? [{ t: 0, f: f(r - 12), d: 0.25, v: 0.55, kind: "sub" }] : []),
    top: (st, r) => (st % 3 === 0 ? [{ t: 0, f: f(r + 12 + MIN[(st / 3) % 4 | 0]), d: 0.2, v: 0.2, kind: "pluck" }] : []),
  },
  tide: {
    bpm: 76,
    swing: 0.18,
    prog: [0, 5, -2, 3],
    minor: false,
    kick: [0, 7, 10],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bass: (st, r) => (st === 0 || st === 10 ? [{ t: 0, f: f(r - 12), d: 0.6, v: 0.4, kind: "bass" }] : []),
    top: (st, r) => {
      if (st === 0 || st === 8) return [0, 4, 7, 11].map((c) => ({ t: 0, f: f(r + 12 + c), d: 1.1, v: 0.07, kind: "keys" as const }));
      if (st === 6 || st === 14) return [{ t: 0, f: f(r + 24 + MAJ[(st / 2) % 5 | 0]), d: 0.4, v: 0.08, kind: "keys" }];
      return [];
    },
  },
  bass: {
    bpm: 140,
    swing: 0,
    prog: [0, 0, 1, -2],
    minor: true,
    kick: [0, 10],
    snare: [8],
    hat: [0, 1, 2, 4, 6, 7, 8, 10, 12, 13, 14, 15],
    bass: (st, r) => (st === 0 || st === 10 || st === 13 ? [{ t: 0, f: f(r - 12), d: 0.55, v: 0.75, kind: "sub" }] : []),
    top: (st, r) => (st % 4 === 2 ? [{ t: 0, f: f(r + 24 + [0, 3, 7, 6][(st / 4) | 0]), d: 0.16, v: 0.1, kind: "lead" }] : []),
  },
};

export class HeatAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private surf: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private radio: StationId = "off";
  private nextStep = 0;
  private step = 0;
  private inCar = false;
  private musicLevel: number;

  constructor(
    private enabled: boolean,
    private volume: number,
    music: number,
  ) {
    this.musicLevel = music;
  }

  /** Create the audio graph (needs a user gesture). */
  unlock() {
    if (!this.enabled || this.ctx) {
      void this.ctx?.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.enabled = false;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setLevels(volume: number, music: number) {
    this.volume = volume;
    this.musicLevel = music;
    if (this.master) this.master.gain.value = volume;
  }

  station(id: StationId) {
    this.radio = id;
    this.step = 0;
    if (this.ctx) this.nextStep = this.ctx.currentTime + 0.05;
  }

  /** Each frame: engine, sirens, the sea, the radio. */
  update(s: State, cam: THREE.Camera, dt: number) {
    const c = this.ctx;
    if (!c || !this.sfx || !this.music) return;
    const car = playerCar(s);
    this.inCar = !!car && !s.down;
    // Engine.
    if (car && !VEHICLES[car.kind].air) {
      if (!this.engine) {
        const osc = c.createOscillator();
        osc.type = "sawtooth";
        const osc2 = c.createOscillator();
        osc2.type = "square";
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 600;
        const gain = c.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfx);
        osc.start();
        osc2.start();
        this.engine = { osc, osc2, filter, gain };
      }
      const spec = VEHICLES[car.kind];
      const sp = speedOf(car);
      const gear = Math.min(5, Math.floor(sp / (spec.top / 5.5)));
      const rpm = (sp - gear * (spec.top / 5.5)) / (spec.top / 5.5);
      const base = spec.body === "bike" ? 70 : spec.water ? 38 : spec.body === "sports" || spec.body === "pursuit" ? 48 : 40;
      const fr = base + rpm * base * 1.4 + gear * 6 + Math.abs(car.throttle) * 8;
      const e = this.engine;
      e.osc.frequency.setTargetAtTime(fr, c.currentTime, 0.05);
      e.osc2.frequency.setTargetAtTime(fr * 0.5, c.currentTime, 0.05);
      e.filter.frequency.setTargetAtTime(380 + Math.abs(car.throttle) * 900 + rpm * 300, c.currentTime, 0.08);
      e.gain.gain.setTargetAtTime(car.hp > 0 ? 0.07 + Math.abs(car.throttle) * 0.07 : 0, c.currentTime, 0.1);
    } else if (this.engine) {
      this.engine.gain.gain.setTargetAtTime(0, c.currentTime, 0.1);
    }
    // The nearest siren.
    const pos = playerPos(s);
    let sd = Infinity;
    for (const k of s.cars) if (k.siren && !k.wrecked) sd = Math.min(sd, Math.hypot(k.x - pos.x, k.z - pos.z));
    if (sd < 220) {
      if (!this.siren) {
        const osc = c.createOscillator();
        osc.type = "triangle";
        const gain = c.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.sfx);
        osc.start();
        this.siren = { osc, gain };
      }
      const wail = 0.5 + 0.5 * Math.sin(c.currentTime * 2.1);
      this.siren.osc.frequency.setTargetAtTime(650 + wail * 600, c.currentTime, 0.05);
      this.siren.gain.gain.setTargetAtTime(0.06 * Math.max(0, 1 - sd / 220), c.currentTime, 0.1);
    } else if (this.siren) this.siren.gain.gain.setTargetAtTime(0, c.currentTime, 0.2);
    // The sea, near the beach.
    const beach = Math.max(0, 1 - Math.abs(pos.x - 600) / 140);
    if (!this.surf && this.noise) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      src.start();
      this.surf = { src, gain, filter };
    }
    if (this.surf) this.surf.gain.gain.setTargetAtTime(beach * (0.05 + 0.04 * Math.sin(c.currentTime * 0.6)) + s.weather.rain * 0.05, c.currentTime, 0.3);
    // Radio: in a vehicle only.
    const on = this.inCar && this.radio !== "off";
    this.music.gain.setTargetAtTime(on ? this.musicLevel * 0.5 : 0, c.currentTime, 0.4);
    if (on) this.schedule();
    void cam;
    void dt;
  }

  private schedule() {
    const c = this.ctx!;
    const st = STYLES[this.radio as Exclude<StationId, "off">];
    if (!st) return;
    const spb = 60 / st.bpm / 4;
    if (this.nextStep < c.currentTime) this.nextStep = c.currentTime + 0.02;
    while (this.nextStep < c.currentTime + 0.25) {
      const step = this.step % 16;
      const bar = Math.floor(this.step / 16) % st.prog.length;
      const root = st.prog[bar];
      const t = this.nextStep + (step % 2 ? st.swing * spb : 0);
      if (st.kick.includes(step)) this.kick(t, this.radio === "bass");
      if (st.snare.includes(step)) this.snare(t, this.radio === "calle" || this.radio === "bass");
      if (st.hat.includes(step)) this.hat(t, this.radio === "tide" ? 0.025 : 0.04);
      for (const n of st.bass(step, root)) this.note(t, n);
      for (const n of st.top(step, root, bar)) this.note(t, n);
      if (this.radio === "tide" && step === 0) this.crackle(t, spb * 16);
      this.nextStep += spb;
      this.step++;
    }
  }

  private note(t: number, n: Note) {
    const c = this.ctx!;
    const g = c.createGain();
    g.connect(this.music!);
    const o = c.createOscillator();
    o.frequency.value = n.f;
    let out: AudioNode = o;
    if (n.kind === "lead" || n.kind === "pad") {
      o.type = "sawtooth";
      const fl = c.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = n.kind === "pad" ? 1400 : 2600;
      o.connect(fl);
      out = fl;
      if (n.kind === "pad") {
        const o2 = c.createOscillator();
        o2.type = "sawtooth";
        o2.frequency.value = n.f * 1.006;
        o2.connect(fl);
        o2.start(t);
        o2.stop(t + n.d + 0.3);
      }
    } else if (n.kind === "bass") o.type = "sawtooth";
    else if (n.kind === "sub") {
      o.type = "sine";
      o.frequency.setValueAtTime(n.f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(n.f, t + 0.06);
    } else if (n.kind === "pluck") o.type = "triangle";
    else o.type = "sine";
    if (n.kind === "bass") {
      const fl = c.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = 520;
      o.connect(fl);
      out = fl;
    }
    out.connect(g);
    const a = n.kind === "pad" ? 0.4 : 0.005;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(n.v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + n.d + a);
    o.start(t);
    o.stop(t + n.d + a + 0.05);
  }

  private kick(t: number, heavy: boolean) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(heavy ? 120 : 150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.35 : 0.22));
    o.connect(g);
    g.connect(this.music!);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, dur: number, freq: number, type: BiquadFilterType, v: number, dest: AudioNode) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number, clap: boolean) {
    this.noiseHit(t, clap ? 0.12 : 0.18, clap ? 1500 : 1800, "bandpass", 0.5, this.music!);
  }

  private hat(t: number, v: number) {
    this.noiseHit(t, 0.04, 8000, "highpass", v * 6, this.music!);
  }

  private crackle(t: number, dur: number) {
    for (let i = 0; i < 6; i++) this.noiseHit(t + Math.random() * dur, 0.01, 3000, "highpass", 0.06, this.music!);
  }

  /* -------------------------------------------------------------- effects */

  private atten(d: number) {
    return Math.max(0, 1 - d / 140) ** 1.4;
  }

  shot(weapon: string, d: number) {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const k = this.atten(d);
    if (k <= 0.01) return;
    const t = c.currentTime;
    const heavy = weapon === "shotgun" || weapon === "rifle";
    this.noiseHit(t, heavy ? 0.22 : 0.13, heavy ? 900 : 1400, "lowpass", 0.7 * k, this.sfx);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(heavy ? 110 : 160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.5 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.15);
  }

  boom(d: number) {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const k = Math.max(0.1, this.atten(d * 0.5));
    const t = c.currentTime;
    this.noiseHit(t, 1.4, 300, "lowpass", 1.2 * k, this.sfx);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(25, t + 0.8);
    g.gain.setValueAtTime(0.9 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 1.1);
  }

  crash(n: number, d: number) {
    if (!this.ctx || !this.sfx) return;
    this.noiseHit(this.ctx.currentTime, 0.25 + n * 0.3, 700, "lowpass", (0.3 + n * 0.6) * this.atten(d), this.sfx);
  }

  punch(d: number) {
    if (!this.ctx || !this.sfx) return;
    this.noiseHit(this.ctx.currentTime, 0.07, 400, "lowpass", 0.5 * this.atten(d * 3), this.sfx);
  }

  glass(d: number) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noiseHit(t + i * 0.02, 0.08, 5000 + i * 800, "highpass", 0.25 * this.atten(d), this.sfx);
  }

  horn() {
    this.tone([[392, 0, 0.35], [494, 0, 0.35]], "square", 0.06);
  }

  hurt() {
    if (!this.ctx || !this.sfx) return;
    this.noiseHit(this.ctx.currentTime, 0.12, 250, "lowpass", 0.35, this.sfx);
  }

  pickup() {
    this.tone([[880, 0, 0.08], [1320, 0.07, 0.12]], "triangle", 0.12);
  }

  cash() {
    this.tone([[1046, 0, 0.06], [1568, 0.05, 0.18]], "square", 0.06);
  }

  click() {
    this.tone([[1200, 0, 0.03]], "square", 0.03);
  }

  sting(kind: "wanted" | "lost" | "pass" | "fail" | "start") {
    const seq: Record<string, [number, number, number][]> = {
      wanted: [[330, 0, 0.12], [311, 0.12, 0.25]],
      lost: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.3]],
      pass: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1046, 0.45, 0.6]],
      fail: [[392, 0, 0.25], [349, 0.25, 0.25], [262, 0.5, 0.7]],
      start: [[440, 0, 0.12], [660, 0.12, 0.3]],
    };
    this.tone(seq[kind], kind === "pass" ? "square" : "sawtooth", 0.08);
  }

  private tone(notes: [number, number, number][], type: OscillatorType, v: number) {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const t0 = c.currentTime;
    for (const [fr, at, d] of notes) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(v, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + at + d);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t0 + at);
      o.stop(t0 + at + d + 0.05);
    }
  }

  dispose() {
    try {
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
