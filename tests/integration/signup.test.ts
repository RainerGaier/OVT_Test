import { expect, test } from "vitest";
import { registerUser } from "@/lib/auth";
import { testPrisma } from "../helpers/db";
import { makeUser } from "../factories/user";

test("registerUser creates a user and returns id + email", async () => {
  const result = await registerUser({
    email: "new@example.com",
    password: "password-123",
  });
  expect(result.email).toBe("new@example.com");
  const stored = await testPrisma.user.findUnique({
    where: { email: "new@example.com" },
  });
  expect(stored?.passwordHash).toBeTruthy();
});

test("registerUser rejects a duplicate email", async () => {
  await makeUser({ email: "dupe@example.com" });
  await expect(
    registerUser({ email: "dupe@example.com", password: "password-123" }),
  ).rejects.toThrow(/already registered/i);
});

test("registerUser rejects invalid input", async () => {
  await expect(
    registerUser({ email: "not-an-email", password: "x" }),
  ).rejects.toThrow();
});
