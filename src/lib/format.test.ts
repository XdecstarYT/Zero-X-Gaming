import { describe, expect, it } from "vitest";
import { formatCompact, timeAgo } from "./format";
import { formatKeyCode } from "./keys";

describe("formatCompact", () => {
  it("abbreviates large numbers", () => {
    expect(formatCompact(48210)).toBe("48.2K");
    expect(formatCompact(999)).toBe("999");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it.each([
    ["2026-09-29T11:59:40Z", "just now"],
    ["2026-09-29T11:55:00Z", "5m ago"],
    ["2026-09-29T09:00:00Z", "3h ago"],
    ["2026-09-26T12:00:00Z", "3d ago"],
    ["2026-09-30T12:00:00Z", "just now"], // future clamps
  ])("%s → %s", (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});

describe("formatKeyCode", () => {
  it.each([
    ["KeyW", "W"],
    ["Digit3", "3"],
    ["ArrowLeft", "←"],
    ["Space", "Space"],
  ])("%s → %s", (code, label) => {
    expect(formatKeyCode(code)).toBe(label);
  });
});
