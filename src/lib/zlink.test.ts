import { describe, expect, it } from "vitest";
import { accessCode, DOSSIER, scramble, TRANSMISSIONS } from "./zlink";

describe("ZLink+ teaser", () => {
  it("decrypts a line from left to right, keeping its shape", () => {
    const t = "ARE YOU LINKED?";
    expect(scramble(t, 1)).toBe(t);
    const half = scramble(t, 0.5, () => 0);
    expect(half.slice(0, 7)).toBe(t.slice(0, 7));
    expect(half).toHaveLength(t.length);
    expect(half[7]).toBe(" ");
    expect(scramble(t, 0, () => 0).replace(/ /g, "")).not.toContain("A");
  });

  it("hands out stable, well-formed access codes", () => {
    expect(accessCode(42)).toBe(accessCode(42));
    expect(accessCode(42)).not.toBe(accessCode(43));
    expect(accessCode(7)).toMatch(/^ZL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Real seeds are timestamps: they must not collapse to one code.
    const now = 1_790_000_000_000;
    const codes = new Set(Array.from({ length: 500 }, (_, i) => accessCode(now + i * 37)));
    expect(codes.size).toBe(500);
    expect(accessCode(now)).not.toBe("ZL-AAAA-AAAA");
  });

  it("never says what it is", () => {
    const words = [...TRANSMISSIONS, ...DOSSIER.flatMap((d) => [d.label, d.open ? d.value : ""])].join(" ").toLowerCase();
    for (const w of ["pass", "subscription", "library", "catalog", "every game", "unlimited"]) expect(words).not.toContain(w);
    // The secret rows are blacked out.
    for (const d of DOSSIER.filter((x) => x.open === undefined)) expect(d.value).toMatch(/^[█ ]+$/);
  });
});
