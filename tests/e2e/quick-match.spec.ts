import { dismissRotate, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 506 } });

/** Quick match: two strangers press one button each and land in the same match, no code shared. */
test("Boundary Blitz quick match pairs two players and starts", async ({ page, context }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const url = "/games/boundary-blitz?net=local&cricket=test";
  await page.addInitScript(() => {
    localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 10, hasPass: false, purchases: ["unlock:sports-plus"], challenges: {} }));
    localStorage.setItem("zx-cricket-prefs", JSON.stringify({ gfx: "low", overs: 2 }));
  });
  const second = await context.newPage();
  await second.addInitScript(() => sessionStorage.setItem("zx-intro-seen", "1"));
  for (const p of [page, second]) p.on("pageerror", (e) => errors.push(e.message));

  async function open(p: typeof page) {
    await p.goto(url);
    await p.getByRole("button", { name: "Play", exact: true }).click();
    await dismissRotate(p);
    const stage = p.getByTestId("game-stage");
    await expect(stage.getByTestId("cricket-quick")).toBeVisible();
    return stage;
  }
  const a = await open(page);
  const b = await open(second);
  await a.getByTestId("cricket-quick").click();
  await expect(a.getByTestId("cricket-online-status")).toContainText("waiting for your opponent", { timeout: 20_000 });
  await b.getByTestId("cricket-quick").click();
  // Same room, and the match starts by itself.
  await expect(a.getByTestId("cricket-score")).toBeVisible({ timeout: 60_000 });
  await expect(b.getByTestId("cricket-score")).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
