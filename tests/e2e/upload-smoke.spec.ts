import { expect, test } from "@playwright/test";

test("sign in, upload a file, see it listed, and delete it", async ({ page }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;
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

  // Select a small in-memory text file, then click Upload.
  await page.getByRole("main").locator('input[type="file"]').setInputFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello upload"),
  });
  await page.getByRole("button", { name: /^upload$/i }).click();

  // First hit of /api/upload (+ the follow-up /api/uploads refresh) pays a
  // one-time Next.js dev-server compile cost, so give this assertion more
  // room than the default 5s before treating it as a real failure.
  await expect(page.getByText("hello.txt")).toBeVisible({ timeout: 15_000 });

  // Delete it.
  await page.getByRole("button", { name: /delete hello\.txt/i }).click();
  await expect(page.getByText("hello.txt")).toHaveCount(0);
});
