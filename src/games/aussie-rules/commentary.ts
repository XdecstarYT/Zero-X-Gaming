import { FootySim, points, type SimEvent } from "./sim";

/**
 * The commentary box: a line for the moments that matter, in the voice of a
 * footy caller. Variety is picked from the match clock, so the same match
 * always reads the same (Live Sports viewers see the same calls).
 */
export function commentary(e: SimEvent, sim: FootySim): string | null {
  const pick = (lines: string[]) => lines[Math.floor(sim.time * 7.31) % lines.length];
  const name = (id: number) => sim.players[id]?.name ?? "";
  const club = (team: 0 | 1) => sim.clubs[team].name;
  const score = () => `${sim.clubs[0].short} ${FootySim.fmt(sim.score[0])}, ${sim.clubs[1].short} ${FootySim.fmt(sim.score[1])}`;
  switch (e.kind) {
    case "goal": {
      const n = name(e.by);
      const d = Math.round(e.dist);
      if (e.afterSiren) return `AFTER THE SIREN! ${n} kicks it from ${d} out! ${score()}.`;
      if (d >= 50) return pick([`${n} from ${d} metres... it's a monster! GOAL!`, `Bang! ${n} launches from ${d}, and it sails through!`]);
      return pick([`GOAL! ${n} slots it from ${d} metres. ${score()}.`, `${n} goes back, takes the kick... straight through the middle!`, `Six points to ${club(e.team)}, ${n} doing the honours from ${d} out.`]);
    }
    case "behind":
      if (e.post) return pick(["Hit the post! Oh, so unlucky.", "Doink! Off the woodwork for a behind."]);
      if (e.rushed) return "Rushed through for a behind; that'll do the defence.";
      return pick([`${name(e.by)} misses. Just the one point.`, `Wide from ${name(e.by)}, a behind.`, `${name(e.by)}'s kick drifts across the face: behind.`]);
    case "mark":
      if (e.screamer) return pick([`SCREAMER! ${name(e.id)} climbs into the heavens and pulls it down!`, `Oh, look at that! ${name(e.id)} sits on the pack: mark of the year contender!`]);
      if (e.contested) return pick([`Strong contested grab by ${name(e.id)}.`, `${name(e.id)} wins the one-on-one: big hands.`]);
      return sim.time % 3 < 1 ? `${name(e.id)} marks on the lead.` : null;
    case "kick":
      if (e.style === "torpedo") return pick([`${name(e.id)} goes the torpedo! Look at it spiral!`, `A big torp from ${name(e.id)}!`]);
      if (e.style === "snap" && e.shot) return `${name(e.id)} snaps around the body...`;
      if (e.shot && e.power > 0.8) return `${name(e.id)} has a long shot...`;
      return null;
    case "tackle":
      if (Math.floor(sim.time * 3) % 3) return null;
      return pick([`Huge tackle by ${name(e.id)}!`, `${name(e.id)} wraps up ${name(e.on)}: that's a beauty.`, `Caught! ${name(e.id)} pins the arms.`]);
    case "free":
      return `Free kick, ${name(e.id)}: ${e.reason.toLowerCase()}.`;
    case "spoil":
      return sim.time % 4 < 1 ? `Great spoil from ${name(e.id)}.` : null;
    case "brokenTackle":
      if (Math.floor(sim.time * 2) % 2) return null;
      return pick([`${name(e.id)} breaks the tackle! Away he goes!`, `Fend-off! ${name(e.id)} shrugs them off.`]);
    case "siren":
      return e.quarter >= 4 ? null : `There's the siren: end of the ${["first", "second", "third"][e.quarter - 1]} quarter. ${score()}.`;
    case "over": {
      const us = points(sim.score[0]);
      const them = points(sim.score[1]);
      if (us === them) return `Full time and it's a DRAW! ${score()}.`;
      const w = us > them ? 0 : 1;
      return `Full time: ${club(w)} win by ${Math.abs(us - them)} points. ${score()}.`;
    }
    case "quarter":
      return `Into the ${["", "first", "second", "third", "last"][e.quarter]} quarter we go.`;
    default:
      return null;
  }
}
