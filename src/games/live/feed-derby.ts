import { DerbyAudio } from "../diamond-derby/audio";
import { DerbyHud } from "../diamond-derby/hud";
import { DerbyView } from "../diamond-derby/render";
import { DerbySim, ROUNDS } from "../diamond-derby/sim";
import type { FeedFactory } from "./broadcast";

/** Derby Night: an AI slugger takes on the field, on the centre-field camera. */
const derbyFeed: FeedFactory = (host, card, slot, o) => {
  if (card.kind !== "derby") throw new Error("not a derby slot");
  const name = card.hitter.name;
  const sim = new DerbySim({ seed: slot.seed, difficulty: "rookie", autopilot: true });
  const view = new DerbyView(host, sim, o.detail, card.tod, { you: name });
  view.showAim = false;
  const hud = new DerbyHud(host, sim, o.coarse, name, true);
  const audio = new DerbyAudio(true, 0.8, 0.13);
  let muted = true;
  const short = name.replace(/".*" /, "").split(" ").slice(-1)[0];
  return {
    step(dt, catchUp) {
      sim.step(dt, { aimZ: 0, aimY: 0.8, swing: false });
      for (const e of sim.events) {
        if (e.kind === "homer") o.say(e.moonshot ? `MOONSHOT! ${short} launches one ${e.dist} feet!` : `${short} goes deep: ${e.dist} ft, ${e.ev} mph off the bat.`);
        else if (e.kind === "round") o.say(e.won ? `${short} wins the ${ROUNDS[e.round].toLowerCase()}, ${e.you} to ${e.them}!` : `${short} is out in the ${ROUNDS[e.round].toLowerCase()}, ${e.you} to ${e.them}.`);
        else if (e.kind === "over") o.say(e.champion ? `${name} is your Derby champion!` : "That's the derby.");
        else if (e.kind === "out" && e.outs === 9) o.say(`One out left for ${short}.`);
        if (catchUp) continue;
        view.onEvent(e);
        hud.onEvent(e);
        if (!muted) audio.onEvent(e);
      }
      sim.events.length = 0;
    },
    render(dt) {
      view.render(dt, "broadcast");
      hud.update(dt);
    },
    over: () => sim.phase === "over",
    status: () => (sim.phase === "over" ? `${short}: ${sim.totalHrs} HR · final` : `${ROUNDS[Math.min(sim.round, 2)]} · ${short} ${sim.hrs} HR, ${sim.outs} outs`),
    setMuted(m) {
      muted = m;
      if (!m) {
        audio.unlock();
        audio.resume();
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

export default derbyFeed;
