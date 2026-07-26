import { PrismaClient } from "@prisma/client";
import { afterAll, expect, test } from "vitest";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

afterAll(() => prisma.$disconnect());

test("demo user is present after seeding", async () => {
  const user = await prisma.user.findUnique({
    where: { email: "demo@example.com" },
  });
  expect(user).not.toBeNull();
  expect(user?.name).toBe("Demo User");
});

test("deleting a user cascades to their uploads", async () => {
  const user = await prisma.user.create({
    data: { email: "cascade@example.com" },
  });
  await prisma.upload.create({
    data: {
      userId: user.id,
      filename: "f.txt",
      url: "http://x/f.txt",
      contentType: "text/plain",
      size: 1,
    },
  });
  await prisma.user.delete({ where: { id: user.id } });
  const remaining = await prisma.upload.count({ where: { userId: user.id } });
  expect(remaining).toBe(0);
});
