import AxeBuilder from "@axe-core/playwright";
import { dismissRotate, expect, test } from "./fixtures";

const PAGES = [
  "/",
  "/games",
  "/sports",
  "/games/neon-siege",
  "/games/trenches",
  "/games/code-3",
  "/leaderboards",
  "/battle-pass",
  "/locker",
  "/shop",
  "/zlink",
  "/games/linkwave",
  "/games/zenith",
  "/games/zero-city", "/games/lifeline",
  "/cash-cup",
  "/nextx",
  "/profile",
  "/settings",
];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.route("**/rest/v1/rpc/get_leaderboard*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map(
        (v) =>
          `${v.id}: ${v.help} → ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });
}

test("no serious accessibility violations with a game running and the sign-in dialog open", async ({ page }) => {
  await page.goto("/games/trenches?net=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByRole("button", { name: "Quick battle vs bots" })).toBeVisible();
  let results = await new AxeBuilder({ page }).include('[data-testid="game-stage"]').analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual(
    [],
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  results = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual(
    [],
  );
});

test("no serious accessibility violations in the Neon Siege mission menu", async ({ page }) => {
  await page.goto("/games/neon-siege?net=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[data-testid="game-stage"]').analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual(
    [],
  );
});

test("no serious accessibility violations in the Trenches menu", async ({ page }) => {
  await page.goto("/games/trenches?net=local");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByRole("button", { name: "Create lobby" })).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[data-testid="game-stage"]').analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual(
    [],
  );
});

for (const path of ["/", "/games", "/settings", "/battle-pass", "/locker", "/shop", "/games/neon-siege", "/zlink"]) {
  test(`X-1+ theme: no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("zx-settings", JSON.stringify({ state: { theme: "x1" }, version: 2 })),
    );
    await page.route("**/rest/v1/rpc/get_leaderboard*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "x1");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}
