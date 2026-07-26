import { expect, test } from "vitest";
import { authorizeCredentials } from "@/lib/auth";
import { makeUser } from "../factories/user";

test("authorizeCredentials returns the user on correct password", async () => {
  await makeUser({ email: "log@example.com", password: "right-password" });
  const user = await authorizeCredentials({
    email: "log@example.com",
    password: "right-password",
  });
  expect(user?.email).toBe("log@example.com");
});

test("authorizeCredentials returns null on wrong password", async () => {
  await makeUser({ email: "log2@example.com", password: "right-password" });
  const user = await authorizeCredentials({
    email: "log2@example.com",
    password: "wrong-password",
  });
  expect(user).toBeNull();
});

test("authorizeCredentials returns null for unknown email", async () => {
  const user = await authorizeCredentials({
    email: "nobody@example.com",
    password: "whatever",
  });
  expect(user).toBeNull();
});
