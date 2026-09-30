import type { WeaponKind } from "./items";

/**
 * Procedural combat audio: gunshots are filtered noise bursts plus a low
 * "thump", shaped per weapon and attenuated/muffled with distance. No assets.
 */

type Cue = "reload" | "pickup" | "chest" | "hitmarker" | "hurt" | "shieldHit" | "elim" | "heal" | "empty" | "storm";

const SHOT: Record<WeaponKind, { cutoff: number; decay: number; thump: number; gain: number }> = {
  pistol: { cutoff: 3200, decay: 0.12, thump: 140, gain: 0.5 },
  smg: { cutoff: 3800, decay: 0.08, thump: 170, gain: 0.38 },
  ar: { cutoff: 2600, decay: 0.16, thump: 110, gain: 0.55 },
  shotgun: { cutoff: 1600, decay: 0.32, thump: 70, gain: 0.8 },
  sniper: { cutoff: 2000, decay: 0.55, thump: 60, gain: 0.9 },
};

export class SiegeAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  constructor(
    private enabled: boolean,
    private volume: number,
  ) {}

  private ready() {
    if (!this.enabled || this.volume <= 0) return null;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.7;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** A gunshot `dist` cells away (0 = your own gun). `pan` in -1..1. */
  shot(kind: WeaponKind, dist = 0, pan = 0) {
    const ctx = this.ready();
    if (!ctx || !this.noise || !this.master) return;
    const p = SHOT[kind];
    const t = ctx.currentTime;
    const falloff = 1 / (1 + dist * 0.12);
    if (falloff < 0.04) return;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.master);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    // Distant shots lose their crack.
    lp.frequency.value = p.cutoff / (1 + dist * 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(p.gain * falloff, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay * (1 + dist * 0.02));
    src.connect(lp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + p.decay * 1.5 + 0.1);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(p.thump * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(p.thump * 0.5, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(p.gain * 0.8 * falloff, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  /** An explosion `dist` metres away: a long low rumble with a crack up close. */
  boom(dist = 0, pan = 0, big = false) {
    const ctx = this.ready();
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const falloff = (big ? 1.4 : 1) / (1 + dist * 0.05);
    if (falloff < 0.03) return;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.35 + Math.random() * 0.15;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.max(200, 2400 / (1 + dist * 0.06)), t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const g = ctx.createGain();
    const dur = big ? 2.2 : 1.4;
    g.gain.setValueAtTime(0.9 * falloff, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(out);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.1);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(big ? 70 : 95, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9 * falloff, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.62);
  }

  /** An incoming shell: a falling whistle. */
  whistle(pan = 0) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(this.master);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.2);
  }

  cue(name: Cue) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const tone = (type: OscillatorType, from: number, to: number, at: number, dur: number, gain: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(from, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + at + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(gain, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(this.master!);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    const click = (at: number, gain = 0.25, freq = 2400) => {
      if (!this.noise) return;
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(gain, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.04);
      s.connect(bp).connect(g).connect(this.master!);
      s.start(t + at, Math.random() * 0.5);
      s.stop(t + at + 0.06);
    };
    switch (name) {
      case "reload":
        click(0, 0.3, 1800);
        click(0.35, 0.3, 2600);
        click(0.7, 0.35, 1400);
        break;
      case "empty":
        click(0, 0.2, 3200);
        break;
      case "pickup":
        tone("sine", 700, 1050, 0, 0.09, 0.12);
        break;
      case "chest":
        tone("triangle", 520, 780, 0, 0.12, 0.12);
        tone("triangle", 780, 1170, 0.1, 0.18, 0.12);
        tone("sine", 1170, 1560, 0.22, 0.3, 0.08);
        break;
      case "hitmarker":
        click(0, 0.35, 4200);
        break;
      case "shieldHit":
        tone("sine", 1400, 900, 0, 0.08, 0.1);
        break;
      case "hurt":
        tone("sawtooth", 160, 70, 0, 0.18, 0.12);
        break;
      case "elim":
        tone("sine", 660, 990, 0, 0.1, 0.12);
        tone("sine", 990, 1320, 0.08, 0.18, 0.12);
        break;
      case "heal":
        tone("sine", 440, 880, 0, 0.35, 0.08);
        break;
      case "storm":
        tone("sawtooth", 90, 60, 0, 0.6, 0.06);
        break;
    }
  }

  destroy() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
