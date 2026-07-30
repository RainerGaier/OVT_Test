import { expect, test } from "@playwright/test";

test("nav shows the user, links between pages, and signs out", async ({
  page,
}) => {
  const email = `e2e-nav-${Date.now()}@example.com`;
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

  // Nav shows the signed-in email and the page links.
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("link", { name: /^chat$/i }).click();
  await page.waitForURL("**/chat");

  // Sign out → returns to signed-out state; /dashboard is protected again.
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(/\/signin/);
  await page.goto("/dashboard");
  await page.waitForURL(/\/signin/);
});
