import { SportsAudio } from "../sports-kit/audio";
import type { DerbyEvent } from "./sim";

/** The crack of the bat, the pop of the mitt, the organ, the crowd and the fireworks. */
export class DerbyAudio extends SportsAudio {
  private pitches = 0;

  onEvent(e: DerbyEvent) {
    if (!this.ready) return;
    switch (e.kind) {
      case "pitch":
        // Every so often, the organist.
        if (++this.pitches % 7 === 3) this.organ([[3, 1], [7, 1], [10, 1], [15, 2], [10, 1], [15, 3]], 0.13);
        break;
      case "swing":
        this.burst(0.18, 900, 300, 0.12, 0.04, "bandpass", 0.8);
        break;
      case "contact": {
        // Maple on leather: a sharp transient, then the wood ringing.
        const k = Math.min(1, Math.max(0, (e.ev - 75) / 40));
        this.burst(0.06, 4200, 2200, 0.5 + k * 0.4, 0.002, "highpass", 0.7);
        this.tone("triangle", 1150 + k * 300, 900, 0.09, 0.25 + k * 0.25);
        this.tone("sine", 220, 90, 0.12, 0.3);
        this.burst(2.5, 500, 900, 0.1 + k * 0.4, 0.4);
        break;
      }
      case "take":
      case "miss":
        // Pop of the mitt.
        this.tone("sine", 180, 70, 0.08, 0.45);
        this.burst(0.05, 2500, 1200, 0.3, 0.003, "bandpass", 1.2);
        if (e.kind === "miss") this.groan();
        break;
      case "homer":
        this.cheer(e.moonshot ? 1 : 0.85, 6);
        for (let i = 0; i < (e.moonshot ? 6 : 4); i++) {
          this.burst(0.5, 300, 60, 0.35, 0.005, "lowpass", 0.7, 0.9 + i * 0.35);
          this.burst(1.2, 6000, 3000, 0.05, 0.05, "highpass", 0.7, 1.0 + i * 0.35);
        }
        this.organ([[0, 1], [4, 1], [7, 1], [12, 2], [7, 1], [12, 3]], 0.14, 0.06);
        break;
      case "wall":
        this.tone("sine", 140, 60, 0.15, 0.4);
        this.groan();
        break;
      case "out":
        if (e.why === "Fly ball, caught" || e.why === "Foul ball") this.burst(1.2, 600, 400, 0.12, 0.2);
        break;
      case "round":
        if (e.won) this.cheer(0.7, 4);
        else this.groan();
        break;
      case "over":
        if (e.champion) {
          this.cheer(1, 7);
          this.organ([[0, 1], [4, 1], [7, 1], [12, 1], [16, 1], [19, 1], [24, 4]], 0.15, 0.07);
        }
        break;
      default:
        break;
    }
  }
}
