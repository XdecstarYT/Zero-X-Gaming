import { describe, expect, it } from "vitest";
import { friendlyAuthError, mergeFavorites, safeNextPath, validateEmail, validatePassword, validateUsername } from "./auth";

describe("validateUsername", () => {
  it.each([
    ["ab", "at least 3"],
    ["a".repeat(21), "at most 20"],
    ["neon vandal", "letters, numbers"],
    ["neon-vandal", "letters, numbers"],
  ])("rejects %s", (name, msg) => {
    expect(validateUsername(name)).toContain(msg);
  });

  it.each(["abc", "Neon_Vandal", "x".repeat(20), "Player_2026"])("accepts %s", (name) => {
    expect(validateUsername(name)).toBeNull();
  });
});

describe("validateEmail / validatePassword", () => {
  it("validates emails", () => {
    expect(validateEmail(" player@zerox.gg ")).toBeNull();
    expect(validateEmail("player@")).not.toBeNull();
    expect(validateEmail("")).not.toBeNull();
  });
  it("needs 8+ character passwords", () => {
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["/games/orbit?x=1", "/games/orbit?x=1"],
    [null, "/"],
    ["", "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["profile", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("friendlyAuthError", () => {
  it("maps known errors", () => {
    expect(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "Wrong email or password.",
    );
    expect(friendlyAuthError({ code: "23505", message: "duplicate key" })).toBe("That username is taken.");
    expect(friendlyAuthError({ message: "Failed to fetch" })).toContain("Can't reach the server");
  });
  it("falls back to the raw message, then generic copy", () => {
    expect(friendlyAuthError({ message: "Odd thing" })).toBe("Odd thing");
    expect(friendlyAuthError(null)).toContain("Something went wrong");
  });
});

describe("mergeFavorites", () => {
  const known = new Set(["orbit", "grid-lock", "zero-dash"]);
  it("unions local and remote, local first, and only uploads what's missing", () => {
    expect(mergeFavorites(["orbit", "zero-dash"], ["grid-lock", "orbit"], known)).toEqual({
      merged: ["orbit", "zero-dash", "grid-lock"],
      toUpload: ["zero-dash"],
    });
  });
  it("drops unknown games", () => {
    expect(mergeFavorites(["retired-game", "orbit"], [], known)).toEqual({ merged: ["orbit"], toUpload: ["orbit"] });
  });
});
