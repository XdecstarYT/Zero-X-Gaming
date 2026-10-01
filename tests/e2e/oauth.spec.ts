import { expect, test } from "./fixtures";

test("the OAuth consent page asks guests to sign in, and explains itself without a request", async ({ page }) => {
  await page.goto("/oauth/consent");
  await expect(page.getByRole("heading", { name: "Nothing to authorize" })).toBeVisible();

  await page.goto("/oauth/consent?authorization_id=test-request");
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
});
