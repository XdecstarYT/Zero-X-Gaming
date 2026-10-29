/**
 * One day of Planetarch, in order: power, production, demand, the world market, incomes and
 * the budget, money; then society, politics, the world stage, war and research; then what
 * happens monthly and yearly. Your country gets the full treatment every day; the others are
 * run on the same rules, some parts every few days, staggered so each day's work stays small.
 */
import type { Atlas } from "./atlas";
import { buildAtlas } from "./atlas";
import { clearMarkets, demandDay, energyDay, euroRate, flowsOf, incomesDay, investDay, moneyDay, monthlyMoney, newDerived, ordersDay, productionDay, refreshCaches, resetFlows, type D } from "./econ";
import { approvalDay, climateYear, crimeMonth, demographyMonth, disastersDay, epidemicsDay, groupsDay, housingMonth, maybeOutbreak, measuresCost, migrationMonth, protestsDay, servicesDay, servicesYear, strikesDay, unionsWeek, vaccineDay, emissionsOf } from "./society";
import { billsDay, electionsDay, fundsDay, peopleMonth, pollsWeek, setDerived } from "./politics";
import { aidMonth, cablesDay, cleanupsDay, coupMonth, crisesDay, iaeaMonth, imfDay, intelDay, opecMonth, orgsMonth, relationsMonth, resolutionsDay, tradeMonth } from "./diplomacy";
import { aiFirstStrike, capitulationCheck, militaryDay, nuclearProgramDay, occupationDay, occupiedShares, warDay } from "./war";
import { moonDay, olympicsYear, researchDay, territoriesMonth, tourismMonth } from "./progress";
import { aiDay, aiMonth, oppositionMonth } from "./ai";
import { monthlyReport, snapshot, type Snapshot } from "./agenda";
import type { Cable, ElectionResult, World } from "./state";
import { dayOfMonth, monthOf } from "./util";
import { news } from "./news";

export interface DayEvents {
  elections: { nation: number; result: ElectionResult }[];
  report?: string[];
}

/** Time spent in each part of the day (ms), for tuning. */
export const PROF: Record<string, number> = {};
let T = 0;
const tick = (k: string) => {
  const now = performance.now();
  PROF[k] = (PROF[k] ?? 0) + now - T;
  T = now;
};

export class Sim {
  w: World;
  a: Atlas;
  d: D;
  prev: Snapshot | null = null;
  euro = 0.025;
  /** What the UI should know about after a step. */
  events: DayEvents = { elections: [] };
  onCable: (c: Cable, accept: boolean) => void = () => undefined;

  constructor(w: World, a: Atlas, d?: D) {
    this.w = w;
    this.a = a;
    this.d = d ?? newDerived(w);
    setDerived(this.d);
    refreshCaches(w, a, this.d);
    occupiedShares(w, a, this.d);
    this.euro = euroRate(w);
  }

  /** Re-derive the day-to-day figures after a load: a few quiet days. */
  warm() {
    resetFlows();
    for (let i = 0; i < 3; i++) this.economy();
    for (const n of this.w.nations) if (n.alive) {
      groupsDay(this.w, this.d, n, 7);
      approvalDay(this.w, this.d, n);
    }
  }

  private economy() {
    const { w, d } = this;
    for (const n of w.nations) if (n.alive) energyDay(w, d, n);
    for (const n of w.nations) if (n.alive) productionDay(w, d, n);
    for (const n of w.nations) {
      if (!n.alive) continue;
      const f = flowsOf(n);
      const inv = investDay(w, d, n);
      const lockdown = measuresCost(n);
      demandDay(w, d, n, f.consumption * (1 - lockdown), inv, f.gov);
    }
    clearMarkets(w, d);
    for (const n of w.nations) {
      if (!n.alive) continue;
      ordersDay(w, d, n);
      incomesDay(w, d, n);
      moneyDay(w, d, n, this.euro);
    }
  }

  step(): DayEvents {
    const { w, a, d } = this;
    w.day++;
    this.events = { elections: [] };
    const me = w.actor.nation;
    T = performance.now();
    cleanupsDay(w);
    this.economy();
    tick("economy");
    const dom = dayOfMonth(w.day);
    const newMonth = dom === 1;
    const newYear = newMonth && monthOf(w.day) === 0;
    // Society.
    for (const n of w.nations) {
      if (!n.alive) continue;
      const full = n.id === me || (w.day + n.id) % 7 === 0;
      if (n.id === me || (w.day + n.id) % 3 === 0) servicesDay(w, d, n);
      if (full) {
        groupsDay(w, d, n, n.id === me ? 1 : 7);
        approvalDay(w, d, n);
        unionsWeek(w, n);
      }
      strikesDay(w, n);
      if (n.id === me || (w.day + n.id) % 5 === 0) protestsDay(w, a, n);
      if (w.epidemics[n.id]?.length) {
        epidemicsDay(w, d, n);
        vaccineDay(w, n);
      }
      aiDay(w, d, n);
    }
    disastersDay(w, a, d);
    maybeOutbreak(w, a);
    tick("society");
    // Politics.
    for (const n of w.nations) {
      if (!n.alive) continue;
      billsDay(w, n);
      const r = electionsDay(w, a, d, n);
      if (r) this.events.elections.push({ nation: n.id, result: r });
      if ((w.day + n.id) % 7 === 0) pollsWeek(w, n);
      fundsDay(w, n);
      imfDay(w, d, n);
      if (n.id === me || (w.day + n.id) % 7 === 0) intelDay(w, n);
      militaryDay(w, n, d);
      nuclearProgramDay(w, n);
      if (n.id === me) researchDay(w, n);
      else if ((w.day + n.id) % 7 === 0) for (let k = 0; k < 7; k++) researchDay(w, n);
    }
    tick("politics");
    // The world stage.
    crisesDay(w);
    resolutionsDay(w, d);
    cablesDay(w, a, d, (c, ok) => this.onCable(c, ok));
    tick("world");
    // War.
    for (const war of w.wars) {
      if (war.over) continue;
      warDay(w, a, d, war);
      capitulationCheck(w, a, d, war);
    }
    occupationDay(w, a, d);
    if (w.day % 7 === 0) for (const n of w.nations) if (n.alive) aiFirstStrike(w, a, d, n);
    moonDay(w);
    tick("war");
    // Monthly.
    if (newMonth) {
      this.euro = euroRate(w);
      for (const n of w.nations) {
        if (!n.alive) continue;
        monthlyMoney(w, d, n);
        demographyMonth(w, n);
        housingMonth(w, n);
        crimeMonth(w, n);
        migrationMonth(w, d, n);
        peopleMonth(w, n);
        coupMonth(w, n);
        tourismMonth(w, d, n);
        aiMonth(w, a, d, n);
        oppositionMonth(w, n);
        n.emissions = emissionsOf(w, d, n);
      }
      relationsMonth(w);
      orgsMonth(w, d);
      opecMonth(w, d);
      aidMonth(w);
      tradeMonth(w, d);
      iaeaMonth(w);
      territoriesMonth(w, d);
      if (monthOf(w.day) % 3 === 0) refreshCaches(w, a, d);
      const n = w.nations[me];
      const lines = monthlyReport(w, d, n, this.prev);
      this.prev = snapshot(w, d, n);
      w.reports.push({ day: w.day, title: `${new Date(Date.UTC(2027, 0, 1) + w.day * 864e5).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} report`, lines });
      if (w.reports.length > 36) w.reports.shift();
      this.events.report = lines;
      // Legacy: approval, stability and a growing economy add up.
      const add = Math.max(0, (n.approval - 30) * 0.4 + (n.stability - 40) * 0.3 + n.growth * 200);
      w.score += add;
      n.score = w.score;
    }
    tick("monthly");
    // Prune what's finished.
    if (w.day % 30 === 0) {
      w.strikes = w.strikes.filter((x) => !x.settled || w.day - x.deadline < 60);
      w.protests = w.protests.filter((x) => !x.over || w.day - x.day < 90);
      w.cables = w.cables.filter((x) => w.day - x.day < 365);
      w.wars = w.wars.filter((x) => !x.over || w.day - x.start < 365 * 3 || x.attackers.includes(me) || x.defenders.includes(me));
    }
    if (newYear) {
      for (const n of w.nations) if (n.alive) servicesYear(n);
      climateYear(w, d);
      olympicsYear(w);
      news(w, me, `Happy new year: ${new Date(Date.UTC(2027, 0, 1) + w.day * 864e5).getUTCFullYear()}. The world is ${w.climate.temp.toFixed(2)}°C warmer than before industry.`, "world");
    }
    return this.events;
  }
}

/* ------------------------------------------------------------------ saving */

/** The world as JSON (the day-to-day figures are rebuilt on load). */
export function saveWorld(w: World): string {
  return JSON.stringify(w, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v));
}
export function loadWorld(json: string): World {
  return JSON.parse(json) as World;
}

export { buildAtlas };
