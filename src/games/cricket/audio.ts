import { SportsAudio } from "../sports-kit/audio";
import type { SimEvent } from "./sim";

/** Willow on leather, the ball off the pitch, stumps rattling, the appeal and a T20 crowd. */
export class CricketAudio extends SportsAudio {
  onEvent(e: SimEvent) {
    if (!this.ready) return;
    switch (e.kind) {
      case "runup":
        this.burst(1.6, 300, 500, 0.06, 0.6);
        break;
      case "bounce":
        this.tone("sine", 160, 90, 0.07, 0.18);
        this.burst(0.05, 1200, 600, 0.12, 0.003, "bandpass", 1.2);
        break;
      case "hit": {
        // The "thock" of a middled bat: a dry transient and a woody ring.
        const k = Math.min(1, e.quality);
        this.burst(0.05, 3400, 1800, 0.35 + 0.35 * k, 0.002, "bandpass", 1.6);
        this.tone("triangle", 720 + k * 160, 520, 0.09, 0.2 + 0.2 * k);
        this.tone("sine", 190, 120, 0.1, 0.25);
        if (e.loft) this.burst(2.4, 450, 900, 0.12 + 0.3 * k, 0.5);
        break;
      }
      case "edge":
        this.burst(0.04, 4200, 2600, 0.25, 0.002, "highpass", 0.8);
        this.burst(1.5, 500, 300, 0.25, 0.1);
        break;
      case "stumps":
        for (let i = 0; i < 3; i++) this.tone("square", 900 - i * 140, 500, 0.06, 0.08, i * 0.05);
        this.burst(0.2, 2600, 900, 0.3, 0.004, "bandpass", 1.4);
        break;
      case "pad":
        this.tone("sine", 120, 80, 0.08, 0.25);
        if (e.appeal) this.burst(1.0, 650, 900, 0.45, 0.08, "bandpass", 1.4);
        break;
      case "catch":
        this.tone("sine", 220, 120, 0.06, 0.3);
        break;
      case "out":
        this.cheer(1, 5);
        this.organ([[0, 1], [3, 1], [7, 1], [12, 3]], 0.12, 0.05);
        break;
      case "four":
        this.cheer(0.75, 4);
        this.organ([[0, 1], [4, 1], [7, 2]], 0.12, 0.05);
        break;
      case "six":
        this.cheer(1, 6);
        this.organ([[0, 1], [4, 1], [7, 1], [12, 1], [7, 1], [12, 3]], 0.11, 0.06);
        for (let i = 0; i < 4; i++) this.burst(0.5, 300, 60, 0.3, 0.005, "lowpass", 0.7, 0.8 + i * 0.3);
        break;
      case "drop":
        this.groan();
        break;
      case "notout":
        this.groan();
        break;
      case "matchEnd":
        this.cheer(1, 7);
        break;
    }
  }
}
