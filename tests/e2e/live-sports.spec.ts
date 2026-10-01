import { expect, test } from "./fixtures";

/** Sports+ Live: free to watch, three channels in sync with the clock, commentary and the schedule. */
test("Live Sports: tune in, switch channels, follow the commentary", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Lighter graphics for the software renderer.
    Object.defineProperty(window, "matchMedia", {
      value: (q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    });
  });
  await page.goto("/sports/live?into=240");
  await expect(page.getByRole("heading", { name: /Sports\+ Live/ })).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Channels" });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(page.getByTestId("channel-footy")).toHaveAttribute("aria-selected", "true");

  const player = page.getByTestId("live-player");
  await expect(player.getByRole("status")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("live-status")).toContainText(/ v .*Q\d|Full time/, { timeout: 30_000 });
  await expect(page.getByTestId("live-commentary").locator("li").first()).not.toHaveText(/warming up/, { timeout: 30_000 });

  await page.getByTestId("channel-tennis").click();
  await expect(page.getByTestId("channel-tennis")).toHaveAttribute("aria-selected", "true");
  await expect(player.getByRole("status")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("live-status")).toContainText(" v ", { timeout: 30_000 });

  await page.getByTestId("channel-derby").click();
  await expect(player.getByRole("status")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("live-status")).toContainText(/HR/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
  // Not unlocked: watching is free, playing needs the pass.
  await expect(page.getByRole("link", { name: "Unlock Sports+" })).toBeVisible();
  expect(errors).toEqual([]);
});
