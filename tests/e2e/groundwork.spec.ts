import type { Page } from "@playwright/test";
import { dismissRotate, expect, test } from "./fixtures";

type GW = { s: { pieces: { k: string }[]; mode: string; job: string | null } | null; view: { ready: boolean; rig: { goal: Cam; cur: Cam } } | null };
type Cam = { target: { set(a: number, b: number, c: number): void }; dist: number; yaw: number; pitch: number };
const gw = <T,>(page: Page, f: (g: GW) => T) => page.evaluate(`(${f.toString()})(window.__gw)`) as Promise<T>;

/** Look straight-ish down at a point on the plot, so taps land where we expect. */
const camera = (page: Page, x: number, z: number, dist: number) =>
  page.evaluate(
    ([x, z, dist]) => {
      const g = (window as unknown as { __gw: GW }).__gw;
      for (const k of [g.view!.rig.goal, g.view!.rig.cur]) {
        k.target.set(x, 0, z);
        k.dist = dist;
        k.yaw = 0;
        k.pitch = 1.2;
      }
    },
    [x, z, dist],
  );

async function tap(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId("gw-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

test("Groundwork: lay a brick, run a wall, undo it, and take on a job", async ({ page }, info) => {
  test.setTimeout(300_000);
  const mobile = info.project.name === "mobile";
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource|supabase/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  if (!mobile) await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("zx-groundwork-prefs", JSON.stringify({ quality: "low" }));
    if (!localStorage.getItem("zx-season-s1"))
      localStorage.setItem("zx-season-s1", JSON.stringify({ xp: 0, matches: 0, wins: 0, kills: 0, coins: 100, hasPass: false, purchases: [], challenges: {} }));
  });
  // A NextX title: it plays in the NextX app, for ZLink+ members.
  await page.goto("/games/groundwork?gw");
  await expect(page).toHaveURL(/\/nextx\/play\/groundwork/);
  await expect(page.getByTestId("game-access")).toHaveText("ZLink+ exclusive");
  await page.getByTestId("zlink-lock-join").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await dismissRotate(page);
  await expect(page.getByTestId("gw-title")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("nextx-powered")).toBeVisible();

  // The change log and settings open from the title.
  await page.getByTestId("gw-changelog-open").click();
  await expect(page.getByTestId("gw-panel-changelog")).toContainText("Groundwork opens");
  await page.getByTestId("gw-close").click();

  // Free build on an empty plot.
  await page.getByTestId("gw-free").click();
  await expect(page.getByTestId("gw-pieces")).toHaveText("0");
  await expect.poll(() => gw(page, (g) => !!g.view?.ready), { timeout: 120_000 }).toBe(true);
  await camera(page, 0, 0, 9);
  await page.waitForTimeout(1500);

  // Lay one brick where we tap.
  await expect(page.getByTestId("gw-kind-brick")).toHaveAttribute("aria-pressed", "true");
  await tap(page, 0.5, 0.4);
  await expect(page.getByTestId("gw-pieces")).toHaveText("1");
  expect(await gw(page, (g) => g.s!.pieces[0].k)).toBe("brick");

  // Undo it, and redo it.
  await page.getByTestId("gw-undo").click();
  await expect(page.getByTestId("gw-pieces")).toHaveText("0");
  await page.getByTestId("gw-redo").click();
  await expect(page.getByTestId("gw-pieces")).toHaveText("1");

  // Run a wall, three courses of English bond (short of the 250 pieces that post a final score), from one tap to another.
  await page.getByTestId("gw-tool-wall").click();
  await page.getByTestId("gw-bond-english").click();
  for (let i = 0; i < 9; i++) await page.getByTestId("gw-courses-dec").click();
  await expect(page.getByTestId("gw-courses")).toContainText("3 ·");
  await tap(page, 0.3, 0.3);
  await tap(page, 0.7, 0.3);
  await expect(page.getByTestId("gw-confirm")).toBeVisible();
  await expect(page.getByTestId("gw-confirm")).toContainText("brick");
  await page.getByTestId("gw-build").click();
  await expect.poll(() => gw(page, (g) => g.s!.pieces.length)).toBeGreaterThan(20);
  expect(await gw(page, (g) => g.s!.pieces.some((p) => p.k === "closer"))).toBe(true);
  await expect(page.getByTestId("gw-toast").last()).toContainText("Laid");

  // Undo the wall: the tally goes down.
  const before = await gw(page, (g) => g.s!.pieces.length);
  await page.getByTestId("gw-undo").click();
  await expect.poll(() => gw(page, (g) => g.s!.pieces.length)).toBeLessThan(before);

  // The help sheet.
  await page.getByTestId("gw-help-open").click();
  await expect(page.getByTestId("gw-panel-help")).toContainText("Everything must be held up");
  await page.getByTestId("gw-close").click();

  // Back to the menu, and the first career job.
  await page.getByTestId("gw-quit").click();
  await expect(page.getByTestId("gw-continue")).toBeVisible();
  await page.getByTestId("gw-career").click();
  await expect(page.getByTestId("gw-job-raised-bed")).toBeDisabled();
  await page.getByTestId("gw-job-garden-wall").click();
  await expect(page.getByTestId("gw-panel-job")).toBeVisible();
  await expect(page.getByTestId("gw-checks")).toBeVisible();
  expect(await gw(page, (g) => g.s!.mode)).toBe("career");
  await page.getByTestId("gw-inspect").click();
  await expect(page.getByTestId("gw-panel-report")).toContainText("Not passed yet");

  expect(errors).toEqual([]);
});
