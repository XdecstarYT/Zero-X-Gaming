import { beforeEach, describe, expect, it } from "vitest";
import type { TrenchesMatch } from "./season";
import { addBattle, EMPTY_RECORD, MEDALS, readWarRecord, withBattle } from "./war-record";

const battle = (over: Partial<TrenchesMatch> = {}): TrenchesMatch => ({
  kills: 3,
  deaths: 2,
  captures: 1,
  won: false,
  durationS: 400,
  damage: 600,
  digs: 4,
  grenadeKills: 0,
  bestStreak: 2,
  front: "somme",
  mode: "conquest",
  players: 20,
  ...over,
});

beforeEach(() => localStorage.clear());

describe("war record", () => {
  it("adds battles up and keeps bests", () => {
    let r = withBattle(EMPTY_RECORD, battle());
    r = withBattle(r, battle({ kills: 9, bestStreak: 5, won: true, front: "vimy", mode: "breakthrough" }));
    expect(r).toMatchObject({ battles: 2, wins: 1, kills: 12, deaths: 4, bestKills: 9, bestStreak: 5, breakthroughWins: 1 });
    expect(r.frontsWon).toEqual(["vimy"]);
    expect(r.fronts).toEqual({ somme: 1, vimy: 1 });
  });

  it("awards each medal once, when first earned", () => {
    expect(addBattle(battle()).map((m) => m.id)).toEqual([]);
    expect(addBattle(battle({ won: true })).map((m) => m.id)).toEqual(["dispatches"]);
    expect(addBattle(battle({ won: true }))).toEqual([]);
    expect(addBattle(battle({ kills: 12 })).map((m) => m.id)).toContain("victoria-cross");
    expect(readWarRecord().battles).toBe(4);
  });

  it("five fronts needs a win on every front", () => {
    let r = EMPTY_RECORD;
    for (const front of ["gallipoli", "somme", "verdun", "passchendaele"]) r = withBattle(r, battle({ won: true, front }));
    const five = MEDALS.find((m) => m.id === "five-fronts")!;
    expect(five.earned(r)).toBe(false);
    expect(five.progress(r)).toBeCloseTo(0.8);
    expect(five.earned(withBattle(r, battle({ won: true, front: "vimy" })))).toBe(true);
  });
});
