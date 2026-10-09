/**
 * Social media and the personalities of rival leaders. You post (twice a week at most): most
 * posts win a few followers, some go viral, some backfire. Rival leaders have a trait that
 * shapes how they campaign and how they come for you; their posts fill the feed too.
 *
 * Works on sim.ts's state and seeded stream; nothing at the top level uses another module's
 * values.
 */
import type { PartyId } from "./data";
import * as C from "./campaign";
import * as P from "./politics";
import * as G from "./sim";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ------------------------------------------------------------------ rival leaders

export type TraitId = "firebrand" | "technocrat" | "populist" | "veteran" | "celebrity";
export const TRAITS: { id: TraitId; name: string; icon: string; about: string }[] = [
  { id: "firebrand", name: "Firebrand", icon: "🔥", about: "Attacks rivals often" },
  { id: "technocrat", name: "Technocrat", icon: "🧮", about: "Hard to beat in a debate" },
  { id: "populist", name: "Populist", icon: "📣", about: "Big rallies, and the odd scandal" },
  { id: "veteran", name: "Veteran", icon: "🎖️", about: "Keeps the party united" },
  { id: "celebrity", name: "Celebrity", icon: "🌟", about: "A huge following online" },
];

/** A leader's trait (it comes with the person: a new leader may bring a new one). */
export function traitOf(s: G.GameState, partyId: PartyId): TraitId {
  const p = G.pol(s, s.parties[partyId]?.leader ?? -1);
  return TRAITS[((p?.face ?? 0) >>> 13) % TRAITS.length].id;
}

/** The leading party other than this one (who a firebrand goes after). */
function target(s: G.GameState, self: PartyId, poll: Record<PartyId, number>) {
  return G.running(s)
    .filter((p) => p !== self && !G.party(s, p).others)
    .sort((a, b) => (poll[b] ?? 0) - (poll[a] ?? 0))[0];
}

// ------------------------------------------------------------------ the feed

export interface Post {
  week: number;
  party: PartyId;
  text: string;
  likes: number;
  viral?: boolean;
  backfired?: boolean;
}

export const POST_KINDS = [
  { id: "policy", name: "Explain a policy", icon: "📋", viral: 0.04, risk: 0.02, about: "Steady. Wins a few followers." },
  { id: "attack", name: "Call out a rival", icon: "🎯", viral: 0.09, risk: 0.14, about: "Hits the leading rival; can backfire." },
  { id: "meme", name: "Post a meme", icon: "😂", viral: 0.16, risk: 0.2, about: "Young voters love it, when it lands." },
  { id: "personal", name: "Behind the scenes", icon: "📸", viral: 0.07, risk: 0.03, about: "Charisma counts." },
  { id: "news", name: "React to the news", icon: "⚡", viral: 0.1, risk: 0.1, about: "Twice as likely to fly during a crisis." },
];
export const POST_MAX = 2;

const LINES: Record<string, string[]> = {
  policy: ["Here's how our plan on {law} works, in 60 seconds 🧵", "Facts, not slogans: what {law} means for your family", "We've costed every penny of our {law} plan. Read it here."],
  attack: ["The {rival} have had their chance. They've failed you.", "Another week, another {rival} U-turn.", "Ask the {rival} one simple question about {law}."],
  meme: ["Me reading the {rival} manifesto 😴", "POV: you finally understand {law} 🤯", "Nobody: … The {rival}: 'everything is fine' 🔥🐶☕"],
  personal: ["Coffee with volunteers before a long day on the doorstep ☕", "Thank you to everyone in {region} today. You were brilliant.", "Behind the scenes on the campaign bus 🚌"],
  news: ["Our thoughts are with everyone affected. Here's what we'd do.", "This is why {law} matters. Now.", "Breaking: our response to today's news, in full."],
};

function fill(s: G.GameState, t: string, r: ReturnType<typeof G.roll>, rival?: PartyId) {
  const l = r.pick(G.allLaws(s));
  const c = G.country(s);
  return t
    .replace("{law}", l.name.toLowerCase())
    .replace("{rival}", rival ? G.party(s, rival).short : "government")
    .replace("{region}", c.states[s.homeState]?.name ?? "town");
}

function push(s: G.GameState, p: Post) {
  s.social.posts.unshift(p);
  if (s.social.posts.length > 14) s.social.posts.length = 14;
}

/** The most followers anyone could have: a share of the country. */
export const followerCap = (s: G.GameState) => Math.max(50_000, G.country(s).pop * 0.35);

export const postsThisWeek = (s: G.GameState) => s.social.posts.filter((p) => p.party === s.party && p.week === s.week).length;

/** Post on social media. Returns what happened. */
export function post(s: G.GameState, kind: string): { ok: boolean; viral?: boolean; backfired?: boolean; why?: string } {
  const k = POST_KINDS.find((x) => x.id === kind);
  if (!k) return { ok: false, why: "Unknown post." };
  if (s.over) return { ok: false, why: "Your career is over." };
  if (postsThisWeek(s) >= POST_MAX) return { ok: false, why: "Twice a week is plenty." };
  const r = G.roll(s);
  const so = s.social;
  const ps = s.parties[s.party];
  const you = G.pol(s, s.you);
  // A bigger following helps a post fly, up to a point: nobody has the whole country.
  const cap = followerCap(s);
  const reach = 1 + Math.min(1, so.followers / cap) * 0.5;
  const viralP = k.viral * reach * (kind === "news" && s.crisis ? 2 : 1) * (kind === "personal" ? 0.6 + (you?.charisma ?? 5) / 10 : 1);
  const backfired = r.next() < k.risk * (1 - 0.1 * C.staffSkill(s, "press"));
  const viral = !backfired && r.next() < viralP;
  const poll = G.nationalPoll(s);
  const rival = target(s, s.party, poll);
  const camp = s.campaign[s.party];
  if (backfired) {
    ps.swing -= 0.008;
    P.pressEvent(s, -3);
    so.followers = Math.round(so.followers * 0.99);
  } else {
    const lift = viral ? 0.8 * reach : 0.15;
    for (let i = 0; i < camp.length; i++) camp[i] = clamp(camp[i] + lift, -20, 40);
    so.followers = Math.round(so.followers + (cap - so.followers) * (viral ? 0.05 : 0.004 + r.next() * 0.004));
    if (viral) P.pressEvent(s, 2);
    if (kind === "attack" && rival) s.parties[rival].swing -= viral ? 0.012 : 0.004;
    if (kind === "meme") P.courtGroup(s, "young", viral ? 3 : 1);
  }
  const text = fill(s, r.pick(LINES[kind]), r, rival);
  const likes = Math.round(so.followers * (viral ? 0.25 + r.next() * 0.3 : backfired ? 0.004 : 0.01 + r.next() * 0.03));
  push(s, { week: s.week, party: s.party, text, likes, viral, backfired });
  if (viral) G.news(s, "event", `${G.fullName(you!)}'s post goes viral: "${text}"`, 1);
  if (backfired) G.news(s, "event", `${G.fullName(you!)}'s post backfires: "${text}"`, -1);
  if (viral) C.note(s, "viral");
  return { ok: true, viral, backfired };
}

// ------------------------------------------------------------------ the week

export function initMedia(s: G.GameState) {
  s.social ??= { followers: Math.round(8000 + s.parties[s.party].members * 0.15), posts: [] };
}

/** Rival leaders act on their traits, and post. */
export function rivalsWeek(s: G.GameState) {
  const r = G.roll(s);
  const poll = G.nationalPoll(s);
  const c = G.country(s);
  for (const id of G.running(s)) {
    if (id === s.party || G.party(s, id).others) continue;
    const ps = s.parties[id];
    const tr = traitOf(s, id);
    const leader = G.pol(s, ps.leader);
    const who = leader ? G.fullName(leader) : G.party(s, id).name;
    if (tr === "firebrand" && r.next() < 0.06) {
      const t = s.gov.parties.includes(s.party) && r.next() < 0.5 ? s.party : target(s, id, poll);
      if (t) {
        s.parties[t].swing -= 0.012;
        G.news(s, "party", `${who} (${G.party(s, id).short}) lays into the ${G.party(s, t).short}`, t === s.party ? -1 : 0);
      }
    } else if (tr === "populist") {
      if (r.next() < 0.08) {
        const st = c.states[Math.floor(r.next() * c.states.length)];
        if (!G.party(s, id).only || G.party(s, id).only!.includes(st.key)) s.campaign[id][st.id] = clamp(s.campaign[id][st.id] + 4, -20, 40);
      }
      if (r.next() < 0.008) {
        ps.swing -= 0.03;
        G.news(s, "scandal", `${who}, the ${G.party(s, id).short}'s populist leader, is caught in a row over remarks at a rally`, 0);
      }
    } else if (tr === "veteran") ps.unity = clamp(ps.unity + 0.5, 0, 92);
    else if (tr === "celebrity" && r.next() < 0.04) {
      ps.swing += 0.01;
      push(s, { week: s.week, party: id, text: fill(s, r.pick(LINES.personal), r), likes: Math.round(200_000 + r.next() * 400_000), viral: true });
      G.news(s, "event", `${who}'s post goes viral`, 0);
    }
    // Everyone posts now and then (flavour for the feed).
    if (r.next() < 0.18) {
      const k = r.pick(["policy", "attack", "personal", "news"]);
      push(s, { week: s.week, party: id, text: fill(s, r.pick(LINES[k]), r, k === "attack" ? s.party : undefined), likes: Math.round(500 + r.next() * 20_000 * (tr === "celebrity" ? 8 : 1)) });
    }
  }
}

/** A tougher debate rival raises the bar for winning. */
export const debateBar = (s: G.GameState, rival: PartyId) => (traitOf(s, rival) === "technocrat" ? 8 : 6);
