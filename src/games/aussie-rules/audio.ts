import type { SimEvent } from "./sim";

/**
 * Screamer's sound, all synthesized: the crowd (a bed that swells with the
 * play, roars for goals, groans for behinds), the siren, the umpire's whistle,
 * and the thump of boot, fist and turf on leather.
 */
export class FootyAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private excite = 0;

  constructor(
    private enabled: boolean,
    private volume: number,
  ) {}

  /** Call from a user gesture. */
  unlock() {
    if (!this.enabled || this.ctx) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.enabled = false;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6 * this.volume;
    this.master.connect(ctx.destination);
    // Two seconds of brown-ish noise: the crowd's raw material.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.noise.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.06 * w) / 1.06;
        d[i] = last * 3.2 + w * 0.12;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 650;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.bed = { gain, filter };
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }
  destroy() {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** 0–1: how tense the play is (ball in the forward 50, a pack forming). */
  setExcitement(k: number, dt: number) {
    this.excite += (k - this.excite) * Math.min(1, dt * 1.5);
    if (!this.bed || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(0.14 + this.excite * 0.22, t, 0.3);
    this.bed.filter.frequency.setTargetAtTime(560 + this.excite * 420, t, 0.4);
  }

  private burst(dur: number, f0: number, f1: number, peak: number, attack = 0.25, type: BiquadFilterType = "bandpass", q = 0.7) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** The umpire's whistle: a pea-whistle trill. */
  whistle(long = false) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = long ? 0.9 : 0.4;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 2950;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 32;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g.gain.setValueAtTime(0.12, t + dur - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }

  /** The siren: a long, hoarse, rising-and-falling blast. */
  siren() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = 3.2;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.4);
    g.gain.setValueAtTime(0.22, t + dur - 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.master);
    for (const [k, type] of [[1, "sawtooth"], [1.006, "square"], [2.01, "sawtooth"]] as [number, OscillatorType][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(260 * k, t);
      o.frequency.linearRampToValueAtTime(330 * k, t + 0.6);
      o.frequency.setValueAtTime(330 * k, t + dur - 0.8);
      o.frequency.linearRampToValueAtTime(240 * k, t + dur);
      const og = ctx.createGain();
      og.gain.value = k > 2 ? 0.25 : 0.5;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    this.burst(4, 500, 900, 0.3, 0.6);
  }

  onEvent(e: SimEvent, ours: (team: number) => boolean) {
    if (!this.ctx) return;
    switch (e.kind) {
      case "kick":
        this.tone("sine", 150, 42, 0.14, 0.5 + e.power * 0.3);
        this.burst(0.05, 2500, 1200, 0.25, 0.005, "highpass");
        if (e.shot) this.burst(2.2, 500, 800, 0.22, 0.8);
        break;
      case "handball":
        this.burst(0.06, 1800, 900, 0.3, 0.004, "bandpass", 1.2);
        break;
      case "bounceBall":
        this.tone("sine", 110, 50, 0.1, 0.25 * e.hard + 0.08);
        break;
      case "runBounce":
        this.burst(1.2, 600, 700, 0.12, 0.2);
        break;
      case "mark":
        this.burst(0.05, 1300, 700, 0.35, 0.004, "bandpass", 1.5);
        this.burst(e.screamer ? 3.5 : 1.4, 500, 850, e.screamer ? 0.5 : 0.18, 0.15);
        break;
      case "tackle":
        this.tone("sine", 90, 40, 0.18, 0.4);
        this.burst(0.12, 400, 200, 0.2, 0.01);
        this.burst(1.2, 600, 800, 0.16, 0.12);
        break;
      case "goal":
        this.burst(6, 450, 950, ours(e.team) ? 0.85 : 0.45, 0.3);
        this.burst(6, 900, 1600, ours(e.team) ? 0.35 : 0.2, 0.4);
        break;
      case "behind":
        // "Ohhh": a falling groan.
        this.burst(2.4, 700, 300, 0.32, 0.25);
        break;
      case "spoil":
        this.tone("sine", 120, 60, 0.08, 0.3);
        break;
      case "whistle":
        this.whistle();
        break;
      case "free":
        this.burst(1.6, 500, 650, 0.16, 0.3);
        break;
      case "siren":
      case "over":
        this.siren();
        break;
      case "centre":
        this.burst(2.4, 450, 800, 0.32, 0.4);
        break;
      default:
        break;
    }
  }
}
