import { expect, test } from "@playwright/test";

test("dashboard Trends: empty state → load sample → chart → range toggle", async ({
  page,
}) => {
  const email = `e2e-charts-${Date.now()}@example.com`;
  const password = "password-123";

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL(/\/signin/);

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  // Fresh user: empty state, then load the sample dataset.
  await expect(
    page.getByRole("button", { name: /load sample data/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /load sample data/i }).click();

  // The Recharts SVG renders both series. Scope to the legend: recharts also
  // renders a hidden tooltip node with the same series names, which would
  // otherwise make a bare getByText("Revenue") ambiguous (strict mode).
  await expect(page.locator("path.recharts-line-curve").first()).toBeVisible();
  await expect(
    page.locator(".recharts-legend-item-text").filter({ hasText: "Revenue" }),
  ).toBeVisible();
  await expect(
    page.locator(".recharts-legend-item-text").filter({ hasText: "Users" }),
  ).toBeVisible();

  // Switch the range to 7 days; the chart stays visible.
  await page.getByRole("button", { name: /^7d$/i }).click();
  await expect(page.locator("path.recharts-line-curve").first()).toBeVisible();
});
