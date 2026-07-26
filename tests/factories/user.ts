import type { User } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeUser(
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<User> {
  counter += 1;
  const password = overrides.password ?? "password-123";
  return testPrisma.user.create({
    data: {
      email: overrides.email ?? `user${counter}@example.com`,
      name: overrides.name ?? `User ${counter}`,
      passwordHash: await hashPassword(password),
    },
  });
}
