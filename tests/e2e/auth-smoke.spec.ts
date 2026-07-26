import { expect, test } from "@playwright/test";

test("sign up, sign in, and reach the dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password-123";

  // Sign up
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL("**/signin");

  // Sign in
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  // Dashboard shows the signed-in email
  await expect(page.getByText(email)).toBeVisible();
});

test("unauthenticated visit to /dashboard redirects to /signin", async ({
  page,
}) => {
  await page.goto("/dashboard");
  // Middleware redirects to /signin with a ?callbackUrl=... query, so match the
  // path loosely rather than requiring the URL to end at "signin".
  await page.waitForURL(/\/signin/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});
