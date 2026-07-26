import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

test("hashPassword produces a verifiable argon2 hash", async () => {
  const hash = await hashPassword("s3cret");
  expect(hash).toMatch(/^\$argon2/);
  expect(await verifyPassword(hash, "s3cret")).toBe(true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword("s3cret");
  expect(await verifyPassword(hash, "wrong")).toBe(false);
});
