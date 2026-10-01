/**
 * Shared synthesized sound for the Sports+ games: a looping crowd bed that
 * swells with the tension, filtered-noise bursts (roars, groans, cracks) and
 * simple oscillator tones. Every game builds its own cues on these.
 */
export class SportsAudio {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected noise: AudioBuffer | null = null;
  private bed: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private excite = 0;

  constructor(
    protected enabled: boolean,
    protected volume: number,
    private bedLevel = 0.16,
  ) {}

  get ready() {
    return !!this.ctx;
  }

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
    gain.gain.value = this.bedLevel;
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

  /** 0–1: how tense the moment is. */
  setExcitement(k: number, dt: number) {
    this.excite += (k - this.excite) * Math.min(1, dt * 1.5);
    if (!this.bed || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(this.bedLevel * 0.8 + this.excite * 0.2, t, 0.3);
    this.bed.filter.frequency.setTargetAtTime(560 + this.excite * 420, t, 0.4);
  }

  /** Filtered noise: crowd roars and groans, cracks, scuffs. */
  burst(dur: number, f0: number, f1: number, peak: number, attack = 0.25, type: BiquadFilterType = "bandpass", q = 0.7, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
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

  tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A short tune on a stadium organ (semitones from A4, beats of `beat` seconds). */
  organ(notes: [number, number][], beat = 0.16, peak = 0.07) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    let at = 0;
    for (const [n, len] of notes) {
      const f = 440 * Math.pow(2, n / 12);
      for (const [k, type] of [[1, "square"], [2, "sine"], [0.5, "triangle"]] as [number, OscillatorType][]) this.tone(type, f * k, f * k, beat * len * 0.95, peak * (k === 1 ? 0.6 : 0.8), at);
      at += beat * len;
    }
  }

  /** The crowd: a cheer that builds (k 0–1) or a long "ohhh". */
  cheer(k: number, len = 4) {
    this.burst(len, 450, 950, 0.25 + 0.6 * k, 0.3);
    this.burst(len, 900, 1600, 0.1 + 0.25 * k, 0.4);
  }
  groan() {
    this.burst(2.2, 700, 300, 0.3, 0.25);
  }
}
