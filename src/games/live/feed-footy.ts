import { FootyAudio } from "../aussie-rules/audio";
import { commentary } from "../aussie-rules/commentary";
import { FootyHud } from "../aussie-rules/hud";
import { FootyView } from "../aussie-rules/render";
import { FootySim, NO_INPUT } from "../aussie-rules/sim";
import type { FeedFactory } from "./broadcast";
import { conditions } from "./schedule";

/** Screamer TV: two AI sides, 150-second quarters, on the broadcast camera with replays. */
const footyFeed: FeedFactory = (host, card, slot, o) => {
  if (card.kind !== "footy") throw new Error("not a footy slot");
  const sim = new FootySim({ seed: slot.seed, home: card.home, rival: card.away, difficulty: "legend", quarterSeconds: 150, wet: card.wet });
  sim.autopilot = true;
  const view = new FootyView(host, sim, o.detail, card.tod, { wet: card.wet, spectator: true, replay: { window: 2.2, speed: 0.6 } });
  const hud = new FootyHud(host, sim, o.coarse, { label: `Live · ${conditions(card)}`, spectator: true });
  const audio = new FootyAudio(true, 0.8);
  let muted = true;
  let raining = false;
  return {
    step(dt, catchUp) {
      sim.step(dt, NO_INPUT);
      for (const e of sim.events) {
        const line = commentary(e, sim);
        if (line) o.say(line);
        if (catchUp) continue;
        view.onEvent(e);
        hud.onEvent(e);
        if (!muted) audio.onEvent(e, (t) => t === 0);
      }
      sim.events.length = 0;
    },
    render(dt) {
      view.render(dt, "tv");
      hud.setReplay(view.replaying);
      hud.update(dt);
    },
    over: () => sim.phase === "over",
    status() {
      const [a, b] = sim.score;
      const q = sim.phase === "over" ? "Full time" : `Q${sim.quarter}`;
      return `${sim.clubs[0].short} ${FootySim.fmt(a)} v ${sim.clubs[1].short} ${FootySim.fmt(b)} · ${q}`;
    },
    setMuted(m) {
      muted = m;
      if (!m) {
        audio.unlock();
        audio.resume();
        if (card.wet && !raining) audio.rain();
        raining = card.wet;
      } else audio.suspend();
    },
    setResolution: (k) => view.setResolution(k),
    destroy() {
      hud.destroy();
      view.destroy();
      audio.destroy();
    },
  };
};

export default footyFeed;
