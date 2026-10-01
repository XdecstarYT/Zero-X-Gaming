import { SportsAudio } from "../sports-kit/audio";
import type { TennisEvent } from "./sim";

/**
 * Centre Court's sound: the pock of strings on felt, bounces, the net, the
 * line judges and chair umpire (the browser's speech voice, when there is
 * one), applause and the hush between points.
 */
export class TennisAudio extends SportsAudio {
  private voice: SpeechSynthesisVoice | null = null;

  constructor(enabled: boolean, volume: number, private speak: boolean) {
    super(enabled, volume, 0.07);
  }

  unlock() {
    super.unlock();
    try {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      this.voice = voices.find((v) => /en-GB/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
    } catch {
      this.speak = false;
    }
  }

  destroy() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // No speech.
    }
    super.destroy();
  }

  /** The umpire: calm, a little formal. */
  say(text: string, rate = 1) {
    if (!this.ready || !this.speak || !this.enabled) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = rate;
      u.pitch = 0.95;
      u.volume = Math.min(1, this.volume * 0.9);
      synth.speak(u);
    } catch {
      this.speak = false;
    }
  }

  /** Applause: lots of little claps. */
  applause(k: number, len = 3) {
    for (let i = 0; i < 3; i++) this.burst(len * (0.8 + i * 0.15), 2400 - i * 500, 1600 - i * 300, 0.12 + k * 0.25, 0.08, "bandpass", 1.6);
    this.burst(len, 900, 700, 0.05 + k * 0.12, 0.2);
  }

  onEvent(e: TennisEvent, names: [string, string]) {
    if (!this.ready) return;
    switch (e.kind) {
      case "hit": {
        const k = Math.min(1, e.kmh / 200);
        // Strings on felt: a hollow pock, brighter with pace.
        this.tone("sine", 620 + k * 380, 260, 0.07, 0.35 + k * 0.3);
        this.burst(0.05, 3000, 1500, 0.25 + k * 0.25, 0.002, "bandpass", 1.1);
        if (e.shot === "serve" || e.shot === "smash") this.burst(0.25, 400, 200, 0.05, 0.05, "lowpass");
        break;
      }
      case "bounce":
        this.tone("sine", 300, 140, 0.05, 0.2);
        this.burst(0.04, 1800, 900, 0.12, 0.002);
        if (!e.in) this.say("Out!", 1.2);
        break;
      case "net":
        this.tone("sine", 160, 80, 0.12, 0.3);
        this.burst(0.18, 600, 300, 0.12, 0.01);
        break;
      case "let":
        this.say("Let. First serve.");
        break;
      case "fault":
        if (e.second) this.say("Double fault.");
        else this.say("Fault.");
        this.groan();
        break;
      case "point": {
        const k = Math.min(1, 0.3 + e.rally * 0.07 + (e.why === "winner" || e.why === "ace" ? 0.3 : 0));
        this.applause(k, 2 + k * 2);
        if (e.rally >= 10) this.cheer(0.6, 3);
        setTimeout(() => this.say(e.call), 900);
        break;
      }
      case "game":
        if (e.break) this.cheer(0.6, 3);
        break;
      case "set":
        this.applause(1, 5);
        setTimeout(() => this.say(`Set, ${names[e.winner]}.`), 2200);
        break;
      case "over":
        this.cheer(1, 6);
        this.applause(1, 7);
        setTimeout(() => this.say(`Game, set and match, ${names[e.winner]}.`), 2400);
        break;
      default:
        break;
    }
  }
}
