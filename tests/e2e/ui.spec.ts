import { expect, test } from "@playwright/test";
// Browser tests. Need Chromium: `npx playwright install chromium`, then `pnpm --filter @yaari/customer build && pnpm test:ui`.
test.describe("@ui customer site", () => {
  test("home to menu journey", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/yaari/i);
    await page.getByRole("link", { name: "Order now" }).click();
    await expect(page).toHaveURL(/\/menu/);
    await expect(page.getByRole("searchbox", { name: "Search the menu" })).toBeVisible();
  });
  test("FAQ answers expand", async ({ page }) => {
    await page.goto("/faq");
    await page.getByText("How do I track my order?").click();
    await expect(page.getByText("Open Orders after signing in.")).toBeVisible();
  });
  test("reserve page shows the form", async ({ page }) => {
    await page.goto("/reserve");
    await expect(page.getByRole("heading", { name: "Reserve a table" })).toBeVisible();
    await expect(page.getByLabel("Guests")).toBeVisible();
  });
  test("login form can switch to registration", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await page.getByRole("button", { name: "New here? Register" }).click();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
  test("no 3D canvas on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/"); await page.waitForLoadState("networkidle");
    await expect(page.locator("canvas")).toHaveCount(0);
  });
  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    test("no 3D canvas when the user prefers reduced motion", async ({ page }) => {
      await page.goto("/"); await page.waitForLoadState("networkidle");
      await expect(page.locator("canvas")).toHaveCount(0);
    });
  });
});
