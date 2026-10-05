/**
 * All sound is made here, in code: a calm generative score, a city hum that
 * swells as the camera nears the street, and small effects.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private hum!: GainNode;
  private humFilter!: BiquadFilterNode;
  private reverb!: ConvolverNode;
  private nextChord = 0;
  private chord = 0;
  private enabled = true;
  private levels = { master: 0.8, music: 0.55, effects: 0.75, site: 1 };

  /** Start on the first user gesture (browsers require it). */
  unlock() {
    if (this.ctx || typeof window === "undefined") return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.musicBus = c.createGain();
    this.fxBus = c.createGain();
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(this.master);
    this.fxBus.connect(this.master);
    // City hum: brown noise through a low-pass filter.
    const noise = c.createBufferSource();
    noise.buffer = this.brown(4);
    noise.loop = true;
    this.humFilter = c.createBiquadFilter();
    this.humFilter.type = "lowpass";
    this.humFilter.frequency.value = 380;
    this.hum = c.createGain();
    this.hum.gain.value = 0;
    noise.connect(this.humFilter);
    this.humFilter.connect(this.hum);
    this.hum.connect(this.fxBus);
    noise.start();
    this.applyLevels();
  }

  setLevels(l: Partial<typeof this.levels>) {
    Object.assign(this.levels, l);
    this.applyLevels();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyLevels();
  }

  private applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? (this.levels.master / 100) * this.levels.site : 0, t, 0.1);
    this.musicBus.gain.setTargetAtTime(this.levels.music / 100, t, 0.1);
    this.fxBus.gain.setTargetAtTime(this.levels.effects / 100, t, 0.1);
  }

  suspend() {
    void this.ctx?.suspend();
  }
  resume() {
    void this.ctx?.resume();
  }

  private impulse(seconds: number) {
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.5;
    }
    return b;
  }

  private brown(seconds: number) {
    const c = this.ctx!;
    const n = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    return b;
  }

  /** Call every frame: keeps the music going and the hum at the right level. */
  update(cameraHeight: number, traffic: number, playing: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, 1 - cameraHeight / 420);
    const level = playing ? (0.04 + near * 0.32) * Math.min(1, 0.35 + traffic / 120) : 0;
    this.hum.gain.setTargetAtTime(level, t, 0.4);
    this.humFilter.frequency.setTargetAtTime(260 + near * 520, t, 0.4);
    if (t >= this.nextChord) this.playChord(t);
  }

  /** Slow pad chords with the odd bell on top (C major / A minor family). */
  private playChord(t: number) {
    const c = this.ctx!;
    const progression = [
      [261.63, 329.63, 392.0, 493.88],
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 392.0],
    ];
    const notes = progression[this.chord++ % progression.length];
    const dur = 9;
    for (const f of notes) {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f / 2;
      const o2 = c.createOscillator();
      o2.type = "sine";
      o2.frequency.value = f * 1.002;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 2.5);
      g.gain.linearRampToValueAtTime(0.025, t + dur - 2);
      g.gain.linearRampToValueAtTime(0, t + dur + 1);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o2.start(t);
      o.stop(t + dur + 1.2);
      o2.stop(t + dur + 1.2);
    }
    const pent = [523.25, 587.33, 659.25, 783.99, 880.0];
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.45) continue;
      this.bell(pent[Math.floor(Math.random() * pent.length)], t + 1.5 + i * 2.2 + Math.random(), 0.05);
    }
    this.nextChord = t + dur - 0.5;
  }

  private bell(f: number, t: number, vol: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 3.1);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, sweep = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.fxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, from: number, to: number, vol: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const n = c.createBufferSource();
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.fxBus);
    n.start(t);
  }

  click() {
    this.blip(880, 0.07, "square", 0.05, 0.6);
    this.blip(1320, 0.05, "sine", 0.04);
  }
  swish() {
    this.noiseBurst(0.35, 600, 3200, 0.12);
  }
  thud() {
    this.blip(110, 0.35, "sine", 0.22, 0.35);
    this.noiseBurst(0.18, 300, 120, 0.05);
  }
  tick() {
    this.blip(1800, 0.025, "sine", 0.025);
  }
  error() {
    this.blip(220, 0.18, "sawtooth", 0.04, 0.7);
  }
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bell(659.25, t, 0.08);
    this.bell(987.77, t + 0.12, 0.06);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
