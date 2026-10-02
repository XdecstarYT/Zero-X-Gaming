import { SportsAudio } from "../sports-kit/audio";
import type { GolfEvent } from "./sim";

/**
 * The course: wind in the trees (the shared bed, kept low), birdsong, the
 * swish and the strike (a driver's ping, an iron's crisp click, a putter's
 * tock), the rattle of the cup, splashes, and a gallery that claps politely
 * and roars for the good ones.
 */
export class FairwayAudio extends SportsAudio {
  private birdT = 2;

  /** Polite applause: lots of small claps. */
  private clap(k: number, len = 2.5) {
    const n = Math.round(10 + k * 30);
    for (let i = 0; i < n; i++) this.burst(0.05, 2400 + Math.random() * 1500, 1400, 0.06 + k * 0.05, 0.004, "bandpass", 1.4, Math.random() * len * (0.5 + Math.random() * 0.5));
  }

  tick(dt: number) {
    if (!this.ready) return;
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 3 + Math.random() * 7;
      // A little two- or three-note call.
      const f = 2600 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone("sine", f * (1 + (i % 2) * 0.18), f * 0.82, 0.09, 0.025, i * 0.13);
    }
  }

  onEvent(e: GolfEvent) {
    if (!this.ready) return;
    switch (e.kind) {
      case "meter":
        if (e.stage === 1) this.tone("sine", 660, 660, 0.04, 0.03);
        break;
      case "strike":
        if (e.putt) {
          this.tone("triangle", 900, 700, 0.05, 0.18);
          this.burst(0.04, 2200, 1500, 0.12, 0.002, "bandpass", 2);
        } else {
          // Swish, then the strike: brighter and harder the faster the ball.
          const k = Math.min(1, e.speed / 70);
          this.burst(0.22, 600, 2400, 0.08, 0.15, "bandpass", 0.9);
          this.burst(0.05, 5200, 3000, 0.4 + k * 0.4, 0.002, "highpass", 0.7, 0.18);
          this.tone(k > 0.8 ? "triangle" : "square", k > 0.8 ? 1900 : 1250, 900, 0.07, 0.12 + k * 0.1, 0.18);
          if (e.pure) this.tone("sine", 2600, 2400, 0.25, 0.05, 0.2);
        }
        break;
      case "bounce":
        if (e.speed > 3) this.tone("sine", e.lie === "green" ? 300 : 200, 120, 0.06, Math.min(0.2, e.speed / 60));
        break;
      case "tree":
        this.burst(0.35, 2500, 900, 0.12, 0.01, "bandpass", 0.8);
        this.tone("square", 420, 200, 0.04, 0.08);
        break;
      case "splash":
        this.burst(0.7, 1800, 300, 0.35, 0.01, "lowpass", 0.7);
        this.burst(1.2, 500, 300, 0.12, 0.25);
        break;
      case "lip":
        this.tone("triangle", 1400, 1100, 0.05, 0.12);
        this.burst(1.6, 700, 350, 0.2, 0.15);
        break;
      case "rest":
        if (e.lie === "green" && e.toPin < 1.5) this.clap(0.5);
        break;
      case "holed": {
        // The rattle in the cup, then the gallery.
        for (let i = 0; i < 3; i++) this.tone("triangle", 1300 - i * 150, 1000, 0.04, 0.12, i * 0.07);
        const under = e.par - e.strokes;
        if (e.strokes === 1 || under >= 2) this.cheer(1, 5);
        else if (under === 1) {
          this.cheer(0.6, 3);
          this.clap(0.8);
        } else if (under === 0) this.clap(0.6);
        else this.clap(0.25, 1.5);
        break;
      }
      case "ctp":
        if (e.dist === 0) this.cheer(1, 5);
        else if (e.dist < 3) this.clap(0.8);
        else this.clap(0.3, 1.5);
        break;
      case "penalty":
        this.groan();
        break;
      case "over":
        if (e.won) this.cheer(1, 6);
        else this.clap(0.7, 3);
        break;
      default:
        break;
    }
  }
}
