/**
 * Code 3 sound, all synthesized: a wail / yelp siren, the engine note, radio
 * chirps, gunshots, taser crackle, crashes and handcuffs.
 */
export class Code3Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private siren: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private noise: AudioBuffer | null = null;
  private t = 0;

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
    this.master.gain.value = 0.5 * this.volume;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 0.6;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "square";
    osc2.type = "sawtooth";
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2400;
    osc.connect(f);
    osc2.connect(f);
    f.connect(gain).connect(this.master);
    osc.start();
    osc2.start();
    this.siren = { osc, osc2, gain };

    const e = ctx.createOscillator();
    e.type = "sawtooth";
    const eg = ctx.createGain();
    eg.gain.value = 0;
    const ef = ctx.createBiquadFilter();
    ef.type = "lowpass";
    ef.frequency.value = 400;
    e.connect(ef).connect(eg).connect(this.master);
    e.start();
    this.engine = { osc: e, gain: eg, filter: ef };
  }

  /** Per frame: siren mode, engine speed (m/s) and throttle, whether we're in the car. */
  update(dt: number, o: { siren: boolean; yelp: boolean; speed: number; throttle: number; inCar: boolean; distance: number }) {
    if (!this.ctx || !this.siren || !this.engine) return;
    this.t += dt;
    const now = this.ctx.currentTime;
    const near = o.inCar ? 1 : Math.max(0.15, 1 - o.distance / 60);
    if (o.siren) {
      // Wail: slow sweep. Yelp (horn held): fast sweep.
      const rate = o.yelp ? 3.2 : 0.22;
      const k = (Math.sin(this.t * Math.PI * 2 * rate) + 1) / 2;
      const f = 650 + k * 700;
      this.siren.osc.frequency.setTargetAtTime(f, now, 0.02);
      this.siren.osc2.frequency.setTargetAtTime(f * 1.005, now, 0.02);
      this.siren.gain.gain.setTargetAtTime(0.09 * near, now, 0.05);
    } else this.siren.gain.gain.setTargetAtTime(0, now, 0.05);
    const rpm = 45 + Math.abs(o.speed) * 3.2 + o.throttle * 20;
    this.engine.osc.frequency.setTargetAtTime(rpm, now, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + o.throttle * 500 + Math.abs(o.speed) * 10, now, 0.1);
    this.engine.gain.gain.setTargetAtTime((o.inCar ? 0.07 : 0.02) + o.throttle * 0.03, now, 0.1);
  }

  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = "bandpass") {
    if (!this.ctx || !this.master || !this.noise) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", at = 0) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  radio() {
    this.tone(1400, 0.07, 0.05, "square");
    this.tone(1800, 0.06, 0.04, "square", 0.08);
    this.burst(0.25, 2500, 0.03);
  }
  shot(far: boolean) {
    this.burst(far ? 0.25 : 0.18, far ? 700 : 1500, far ? 0.25 : 0.6, "lowpass");
  }
  taser() {
    for (let i = 0; i < 6; i++) this.tone(90 + Math.random() * 60, 0.05, 0.08, "square", i * 0.05);
  }
  crash(speed: number) {
    this.burst(0.35, 300, Math.min(0.8, speed / 20), "lowpass");
  }
  cuff() {
    this.tone(2600, 0.03, 0.08, "square");
    this.tone(2300, 0.03, 0.08, "square", 0.06);
    this.tone(2600, 0.03, 0.06, "square", 0.12);
  }
  good() {
    this.tone(880, 0.12, 0.06, "triangle");
    this.tone(1320, 0.16, 0.06, "triangle", 0.1);
  }
  bad() {
    this.tone(220, 0.25, 0.08, "sawtooth");
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
}
