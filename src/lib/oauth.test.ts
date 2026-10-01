import { describe, expect, it } from "vitest";
import { describeScopes, hostOf, safeRedirect } from "./oauth";

describe("Sign in with Zero X", () => {
  it("explains known scopes in plain words and keeps unknown ones", () => {
    const s = describeScopes("openid email  profile custom:read openid");
    expect(s.map((x) => x.id)).toEqual(["openid", "email", "profile", "custom:read"]);
    expect(s[1].label).toBe("Your email address");
    expect(s[3].label).toBe("custom:read");
    expect(describeScopes("")).toEqual([]);
    expect(describeScopes(undefined)).toEqual([]);
  });

  it("only redirects to http(s) URLs", () => {
    expect(safeRedirect("https://app.example.com/cb?code=1&state=x")).toBe("https://app.example.com/cb?code=1&state=x");
    expect(safeRedirect("javascript:alert(1)")).toBeNull();
    expect(safeRedirect("data:text/html,hi")).toBeNull();
    expect(safeRedirect("not a url")).toBeNull();
    expect(safeRedirect(null)).toBeNull();
  });

  it("shows hosts, not full URLs", () => {
    expect(hostOf("https://app.example.com/callback")).toBe("app.example.com");
    expect(hostOf("nope")).toBe("");
  });
});
