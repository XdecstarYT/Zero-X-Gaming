/** Tiny WebAudio synth for sound effects. No assets, respects the sound setting. */
export type Sfx = "jump" | "land" | "point" | "bonus" | "hit" | "select" | "wrong";

const PRESETS: Record<Sfx, { type: OscillatorType; from: number; to: number; dur: number; gain: number }> = {
  jump: { type: "square", from: 320, to: 640, dur: 0.12, gain: 0.08 },
  land: { type: "triangle", from: 180, to: 90, dur: 0.08, gain: 0.1 },
  point: { type: "sine", from: 660, to: 990, dur: 0.1, gain: 0.08 },
  bonus: { type: "sine", from: 880, to: 1760, dur: 0.22, gain: 0.08 },
  hit: { type: "sawtooth", from: 220, to: 40, dur: 0.4, gain: 0.12 },
  select: { type: "triangle", from: 520, to: 520, dur: 0.05, gain: 0.06 },
  wrong: { type: "square", from: 200, to: 120, dur: 0.2, gain: 0.08 },
};

export class Sound {
  private ctx: AudioContext | null = null;

  constructor(
    private enabled: boolean,
    private volume: number,
  ) {}

  play(name: Sfx) {
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.ctx ??= new AudioContext();
      const p = PRESETS[name];
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.to), t + p.dur);
      g.gain.setValueAtTime(p.gain * this.volume, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + p.dur);
    } catch {
      // Audio unavailable (autoplay policy, old browser): stay silent.
    }
  }

  destroy() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
