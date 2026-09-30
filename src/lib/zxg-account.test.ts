import { describe, expect, it } from "vitest";
import { ACTIVATION_HINT, accountEmail, accountError, accountNameFromEmail, accountTag, isAccountEmail, validateAccountName } from "./zxg-account";

describe("ZXG accounts", () => {
  it("maps account names to hidden, undeliverable addresses and back", () => {
    expect(accountEmail(" Ace_77 ")).toBe("ace_77@zxg-acc.invalid");
    expect(isAccountEmail("ace_77@zxg-acc.invalid")).toBe(true);
    expect(isAccountEmail("someone@gmail.com")).toBe(false);
    expect(accountNameFromEmail("ace_77@zxg-acc.invalid")).toBe("ace_77");
    expect(accountNameFromEmail("someone@gmail.com")).toBeNull();
  });

  it("formats the public ZXG-ACC tag", () => {
    expect(accountTag("3f9a12bc-1111-2222-3333-444455556666")).toBe("ZXG-ACC-3F9A12BC");
  });

  it("validates names and explains errors without mentioning email", () => {
    expect(validateAccountName("ab")).toMatch(/at least 3/);
    expect(validateAccountName("no spaces")).toMatch(/letters, numbers/);
    expect(validateAccountName("Trench_Rat")).toBeNull();
    expect(accountError({ code: "invalid_credentials" })).toBe("Wrong account name or password.");
    expect(accountError({ code: "user_already_exists" })).toMatch(/taken/);
    expect(accountError({ code: "email_not_confirmed" })).toBe(ACTIVATION_HINT);
  });
});
