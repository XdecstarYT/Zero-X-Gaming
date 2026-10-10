/**
 * WareForge's sounds, synthesised (no audio files): a till ding when money comes in, a low
 * thunk when it goes out, a truck horn, an alarm for trouble and a chime for a goal or a
 * mission. The audio context starts on first use (after a user gesture).
 */
export type Cue = "cash" | "spend" | "horn" | "alarm" | "chime" | "click";

export class Sound {
  enabled = true;
  volume = 1;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last: Partial<Record<Cue, number>> = {};

  private ac() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.4, slide = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  play(cue: Cue) {
    if (!this.enabled || this.volume <= 0) return;
    // At high speed money moves all the time: one of each sound at a time.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - (this.last[cue] ?? -1e9) < (cue === "cash" || cue === "spend" ? 260 : 900)) return;
    this.last[cue] = now;
    const c = this.ac();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    this.master!.gain.value = 0.3 * this.volume;
    const t = c.currentTime + 0.01;
    switch (cue) {
      case "cash":
        this.tone(1568, t, 0.12, "triangle", 0.22);
        this.tone(2093, t + 0.07, 0.28, "sine", 0.2);
        break;
      case "spend":
        this.tone(220, t, 0.14, "sine", 0.22, 0.6);
        break;
      case "horn":
        this.tone(233, t, 0.42, "sawtooth", 0.07);
        this.tone(294, t, 0.42, "sawtooth", 0.06);
        break;
      case "alarm":
        for (let i = 0; i < 2; i++) this.tone(880, t + i * 0.22, 0.16, "square", 0.06, 0.8);
        break;
      case "chime":
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.09, 0.32, "triangle", 0.16));
        break;
      case "click":
        this.tone(1200, t, 0.05, "triangle", 0.14);
        break;
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
