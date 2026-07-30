import type { Reading } from "@prisma/client";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeReading(
  userId: string,
  overrides: Partial<{ label: string; value: number; recordedAt: Date }> = {},
): Promise<Reading> {
  counter += 1;
  return testPrisma.reading.create({
    data: {
      userId,
      label: overrides.label ?? "Revenue",
      value: overrides.value ?? counter * 10,
      recordedAt: overrides.recordedAt ?? new Date(),
    },
  });
}
