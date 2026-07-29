import { expect, test } from "@playwright/test";

test("sign up, sign in, and hold a streamed chat", async ({ page }) => {
  const email = `e2e-chat-${Date.now()}@example.com`;
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

  await page.goto("/chat");
  await page.getByRole("textbox").fill("Hello Claude");
  await page.getByRole("button", { name: /send/i }).click();

  // The mocked stream replies with this exact text.
  await expect(
    page.getByText("This is a mocked streamed reply."),
  ).toBeVisible();

  // The new conversation appears in the sidebar with its generated title.
  await expect(page.getByText("Mock Title")).toBeVisible();
});
