/**
 * Small synthesised sounds (no audio files): a soft click, the gavel when a law passes, paper
 * for a new bill, a crowd for a rally, a tick-tock for the week, and a fanfare or a sigh on
 * election night. The audio context starts on first use (after a user gesture).
 */
export type Cue = "click" | "turn" | "gavel" | "paper" | "cheer" | "coin" | "bad" | "count" | "win" | "lose" | "start";

export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ac() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
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

  private noise(at: number, dur: number, vol: number, lowpass: number, highpass = 0) {
    const c = this.ctx!;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = lowpass;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = highpass;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(lp).connect(hp).connect(g).connect(this.master!);
    src.start(at);
  }

  play(cue: Cue) {
    if (!this.enabled) return;
    const c = this.ac();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const t = c.currentTime + 0.01;
    switch (cue) {
      case "click":
        this.tone(1200, t, 0.05, "triangle", 0.18);
        break;
      case "turn":
        this.tone(880, t, 0.08, "triangle", 0.15);
        this.tone(660, t + 0.12, 0.1, "triangle", 0.12);
        break;
      case "paper":
        this.noise(t, 0.18, 0.25, 6000, 1500);
        break;
      case "gavel":
        for (const k of [0, 0.22]) {
          this.tone(180, t + k, 0.18, "sine", 0.7, 0.5);
          this.noise(t + k, 0.08, 0.5, 1800, 200);
        }
        break;
      case "cheer":
        this.noise(t, 1.2, 0.18, 2600, 500);
        break;
      case "coin":
        this.tone(1320, t, 0.08, "square", 0.08);
        this.tone(1760, t + 0.07, 0.16, "square", 0.08);
        break;
      case "bad":
        this.tone(330, t, 0.25, "sawtooth", 0.12, 0.7);
        break;
      case "count":
        for (let i = 0; i < 3; i++) this.tone(523.25 * [1, 1.25, 1.5][i], t + i * 0.12, 0.3, "triangle", 0.2);
        break;
      case "win":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.14, 0.5, "triangle", 0.25));
        this.noise(t + 0.4, 1.6, 0.16, 3000, 400);
        break;
      case "lose":
        [392, 349.23, 311.13].forEach((f, i) => this.tone(f, t + i * 0.22, 0.45, "sine", 0.22));
        break;
      case "start":
        [392, 523.25, 659.25].forEach((f, i) => this.tone(f, t + i * 0.1, 0.4, "triangle", 0.2));
        break;
    }
  }
}
