import { expect, test } from "vitest";
import { makeUser } from "../factories/user";
import { testPrisma } from "../helpers/db";

test("makeUser creates a user with a password hash", async () => {
  const user = await makeUser({ email: "a@example.com" });
  expect(user.email).toBe("a@example.com");
  expect(user.passwordHash).toBeTruthy();
});

test("each test starts from a truncated database", async () => {
  const count = await testPrisma.user.count();
  expect(count).toBe(0); // truncate ran in beforeEach, so the prior test's user is gone
});
