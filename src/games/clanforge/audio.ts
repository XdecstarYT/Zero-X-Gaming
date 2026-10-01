import { SportsAudio } from "../sports-kit/audio";
import type { BattleEvent } from "./battle";

/** Hammers and coins in the village; cannon fire, arrows, zaps and war horns in a raid. */
export class ClanAudio extends SportsAudio {
  private lastFire = 0;

  build() {
    for (let i = 0; i < 3; i++) {
      this.tone("square", 520, 300, 0.05, 0.08, i * 0.14);
      this.burst(0.06, 2400, 1200, 0.15, 0.003, "bandpass", 1.4, i * 0.14);
    }
  }

  coins(k = 1) {
    for (let i = 0; i < 2 + Math.round(k * 3); i++) this.tone("triangle", 1600 + i * 180, 1900 + i * 180, 0.08, 0.06, i * 0.06);
  }

  mana() {
    this.tone("sine", 660, 990, 0.35, 0.08);
    this.tone("sine", 990, 1320, 0.35, 0.05, 0.08);
  }

  click() {
    this.tone("triangle", 900, 700, 0.04, 0.05);
  }

  nope() {
    this.tone("square", 220, 160, 0.14, 0.06);
  }

  horn() {
    this.tone("sawtooth", 147, 147, 0.9, 0.07);
    this.tone("sawtooth", 220, 220, 0.9, 0.05, 0.05);
    this.burst(1, 300, 200, 0.1, 0.2, "lowpass");
  }

  victory(stars: number) {
    this.organ(
      stars ? [[0, 1], [4, 1], [7, 1], [12, 3]].slice(0, 2 + stars) as [number, number][] : [[0, 2], [-2, 2], [-5, 4]],
      0.16,
      0.06,
    );
  }

  onEvent(e: BattleEvent) {
    if (!this.ready) return;
    switch (e.kind) {
      case "deploy":
        this.burst(0.12, 700, 300, 0.12, 0.01, "bandpass", 0.9);
        break;
      case "fire": {
        // Many defenses fire at once: thin them out.
        const now = performance.now();
        if (now - this.lastFire < 60) return;
        this.lastFire = now;
        if (e.type === "cannon") {
          this.tone("sine", 140, 50, 0.18, 0.22);
          this.burst(0.2, 1200, 200, 0.2, 0.003, "lowpass");
        } else if (e.type === "archerTower") this.burst(0.1, 3000, 1500, 0.08, 0.005, "highpass");
        else if (e.type === "mortar") this.tone("sine", 90, 40, 0.3, 0.25);
        else if (e.type === "spire") {
          this.burst(0.25, 5000, 2000, 0.12, 0.002, "highpass", 3);
          this.tone("sawtooth", 1800, 300, 0.2, 0.04);
        } else if (e.type === "airLance") this.tone("square", 900, 300, 0.12, 0.05);
        break;
      }
      case "boom":
        this.burst(0.7, 600, 60, 0.4, 0.004, "lowpass");
        this.tone("sine", 70, 30, 0.4, 0.3);
        break;
      case "destroyed":
        this.burst(0.9, 900, 120, e.type === "wall" ? 0.12 : 0.3, 0.01, "lowpass");
        break;
      case "died":
        this.tone("triangle", 400, 180, 0.15, 0.04);
        break;
      case "star":
        this.tone("triangle", 880, 880, 0.12, 0.08);
        this.tone("triangle", 1320, 1320, 0.25, 0.08, 0.12);
        break;
      case "end":
        break;
    }
  }
}
