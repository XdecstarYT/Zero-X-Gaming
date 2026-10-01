import { describe, expect, it } from "vitest";
import { card, CHANNELS, channelById, conditions, seedFor, slotAt, title } from "./schedule";

describe("Live Sports schedule", () => {
  it("everyone gets the same slot and seed at the same moment", () => {
    const now = Date.UTC(2026, 9, 1, 12, 34, 56);
    for (const ch of CHANNELS) {
      const a = slotAt(ch, now);
      const b = slotAt(ch, now + 1000);
      expect(a.seed).toBe(b.seed);
      expect(a.start).toBeLessThanOrEqual(now);
      expect(a.end).toBeGreaterThan(now);
      expect(a.end - a.start).toBe(ch.slotMin * 60_000);
      expect(slotAt(ch, now, 1).start).toBe(a.end);
      expect(slotAt(ch, now, 1).seed).not.toBe(a.seed);
    }
    expect(seedFor("footy", 5)).toBe(seedFor("footy", 5));
    expect(seedFor("footy", 5)).not.toBe(seedFor("derby", 5));
  });

  it("each slot has a proper matchup", () => {
    const now = Date.UTC(2026, 9, 1);
    for (let k = 0; k < 40; k++) {
      const f = card(slotAt(channelById("footy"), now, k));
      if (f.kind === "footy") expect(f.home.id).not.toBe(f.away.id);
      const t = card(slotAt(channelById("tennis"), now, k));
      if (t.kind === "tennis") {
        expect(t.players[0].id).not.toBe(t.players[1].id);
        expect(title(t)).toContain(" v ");
        expect(conditions(t)).toMatch(/singles/);
      }
    }
    expect(channelById("nope").id).toBe("footy");
  });
});
