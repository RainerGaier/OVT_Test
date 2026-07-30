import type { Reading } from "@prisma/client";
import { prisma } from "@/lib/db";

export const SERIES = ["Revenue", "Users"] as const;
export const SAMPLE_DAYS = 90;
export const VALID_RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof VALID_RANGES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type NewReading = {
  userId: string;
  label: string;
  value: number;
  recordedAt: Date;
};

// Pure, deterministic sample data: 90 consecutive days x 2 series, values from
// a fixed smooth formula (no randomness). Day index 0 is the oldest; the last
// row is anchored at `now`.
export function sampleReadings(userId: string, now: Date = new Date()): NewReading[] {
  const rows: NewReading[] = [];
  for (let i = 0; i < SAMPLE_DAYS; i++) {
    const recordedAt = new Date(now.getTime() - (SAMPLE_DAYS - 1 - i) * DAY_MS);
    rows.push({
      userId,
      label: "Revenue",
      value: Math.round(1000 + 15 * i + 200 * Math.sin(i / 7)),
      recordedAt,
    });
    rows.push({
      userId,
      label: "Users",
      value: Math.round(500 + 8 * i + 120 * Math.cos(i / 5)),
      recordedAt,
    });
  }
  return rows;
}

// Replace the user's readings with a fresh deterministic set. Idempotent.
export async function generateSampleReadings(userId: string): Promise<number> {
  await prisma.reading.deleteMany({ where: { userId } });
  const result = await prisma.reading.createMany({ data: sampleReadings(userId) });
  return result.count;
}

// The user's readings within the last `days`, oldest first.
export async function listReadings(userId: string, days: number): Promise<Reading[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  return prisma.reading.findMany({
    where: { userId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
  });
}
