import { TennisAudio } from "../ace-rally/audio";
import { TennisHud } from "../ace-rally/hud";
import { KITS, TennisView } from "../ace-rally/render";
import { NO_INPUT, TennisSim } from "../ace-rally/sim";
import type { FeedFactory } from "./broadcast";

/** Centre Court: a one-set match between two touring pros. */
const tennisFeed: FeedFactory = (host, card, slot, o) => {
  if (card.kind !== "tennis") throw new Error("not a tennis slot");
  const [a, b] = card.players;
  const sim = new TennisSim({ seed: slot.seed, difficulty: "pro", surface: card.surface, format: "set", rival: b, you: a.name });
  sim.autopilot = true;
  const view = new TennisView(host, sim, o.detail, card.tod, KITS[card.draw]);
  const hud = new TennisHud(host, sim, o.coarse, true);
  const audio = new TennisAudio(true, 0.8, true);
  let muted = true;
  const last = (n: string) => n.split(" ").slice(-1)[0];
  return {
    step(dt, catchUp) {
      sim.step(dt, NO_INPUT);
      for (const e of sim.events) {
        if (e.kind === "point") {
          const w = last(sim.names[e.winner]);
          if (e.why === "ace") o.say(`Ace! ${w}. ${e.call}.`);
          else if (e.why === "double") o.say(`Double fault. ${e.call}.`);
          else if (e.rally >= 10) o.say(`What a rally: ${e.rally} shots, and ${w} wins it! ${e.call}.`);
          else if (e.why === "winner") o.say(`Winner from ${w}. ${e.call}.`);
        } else if (e.kind === "game" && e.break) o.say(`Break of serve! ${last(sim.names[e.winner])} leads ${sim.score.line(e.winner)}.`);
        else if (e.kind === "set") o.say(`Set, ${sim.names[e.winner]}: ${sim.score.line(e.winner)}.`);
        else if (e.kind === "over") o.say(`Game, set and match, ${sim.names[e.winner]}!`);
        if (catchUp) continue;
        view.onEvent(e);
        hud.onEvent(e);
        if (!muted) audio.onEvent(e, sim.names);
      }
      sim.events.length = 0;
    },
    render(dt) {
      view.render(dt, "broadcast");
      hud.update(dt);
    },
    over: () => sim.phase === "over",
    status() {
      const sc = sim.score;
      const pts = sc.winner >= 0 ? "final" : sc.calls().join("–");
      return `${last(sim.names[0])} v ${last(sim.names[1])} · ${sc.line(0) || "0–0"} · ${pts}`;
    },
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

export default tennisFeed;
