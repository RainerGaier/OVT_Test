import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { sampleReadings } from "../src/lib/readings";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashPassword("demo-password-123");
  const demo = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
      passwordHash,
    },
  });

  // Deterministic sample readings for the demo user (idempotent reseed).
  await prisma.reading.deleteMany({ where: { userId: demo.id } });
  await prisma.reading.createMany({ data: sampleReadings(demo.id) });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
