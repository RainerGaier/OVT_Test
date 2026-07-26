import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

const TABLES = [
  "Message",
  "Conversation",
  "Upload",
  "Reading",
  "Session",
  "Account",
  "VerificationToken",
  "User",
];

export async function truncateAll(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await testPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
}
