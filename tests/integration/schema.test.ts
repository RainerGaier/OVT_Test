import { expect, test } from "vitest";
import { makeUser } from "../factories/user";
import { testPrisma } from "../helpers/db";

test("a created user can be found by email", async () => {
  await makeUser({ email: "found@example.com", name: "Found User" });
  const user = await testPrisma.user.findUnique({
    where: { email: "found@example.com" },
  });
  expect(user?.name).toBe("Found User");
});

test("deleting a user cascades to their uploads", async () => {
  const user = await makeUser();
  await testPrisma.upload.create({
    data: {
      userId: user.id,
      filename: "f.txt",
      url: "http://x/f.txt",
      contentType: "text/plain",
      size: 1,
    },
  });
  await testPrisma.user.delete({ where: { id: user.id } });
  const remaining = await testPrisma.upload.count({
    where: { userId: user.id },
  });
  expect(remaining).toBe(0);
});
