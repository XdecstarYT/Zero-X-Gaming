import { expect, test } from "./fixtures";

test("ZLink+: the home teaser leads to the classified page, which gives nothing away", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("zlink-teaser").click();
  await expect(page).toHaveURL(/\/zlink$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ZLink+ is coming");
  // The file: some rows readable, the rest blacked out.
  const file = page.getByTestId("zlink-file");
  await expect(file).toContainText("Codename");
  await expect(file.getByLabel("Classified")).toHaveCount(3);
  // Nothing on the page says what it is.
  const text = (await page.locator("main").innerText()).toLowerCase();
  for (const w of ["game pass", "subscription", "every game", "unlimited"]) expect(text).not.toContain(w);
});

test("ZLink+: request access hands out a code that stays", async ({ page }) => {
  await page.goto("/zlink");
  await page.getByTestId("zlink-request").click();
  const access = page.getByTestId("zlink-access");
  await expect(access).toContainText("You're on the list");
  const code = (await access.locator("p").nth(1).innerText()).trim();
  expect(code).toMatch(/^ZL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(code).not.toBe("ZL-AAAA-AAAA");
  await page.reload();
  await expect(page.getByTestId("zlink-access")).toContainText(code);
});

test("ZLink+: poke the plus enough and it answers", async ({ page }) => {
  await page.goto("/zlink");
  for (let i = 0; i < 5; i++) await page.getByTestId("zlink-mark").click();
  await expect(page.getByTestId("zlink-egg")).toHaveText("Not yet. 👁");
});
