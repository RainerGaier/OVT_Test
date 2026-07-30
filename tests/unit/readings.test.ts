import { expect, test } from "vitest";
import { sampleReadings, SAMPLE_DAYS, SERIES } from "@/lib/readings";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

test("sampleReadings is deterministic: 180 rows, two series, 90 dates each", () => {
  const rows = sampleReadings("user-1", NOW);
  expect(rows).toHaveLength(SAMPLE_DAYS * 2);
  expect(new Set(rows.map((r) => r.label))).toEqual(new Set(SERIES));
  for (const label of SERIES) {
    const dates = rows.filter((r) => r.label === label).map((r) => +r.recordedAt);
    expect(new Set(dates).size).toBe(SAMPLE_DAYS);
  }
});

test("sampleReadings has fixed values and a now-anchored date range", () => {
  const rows = sampleReadings("user-1", NOW);
  const revenue = rows.filter((r) => r.label === "Revenue");
  const users = rows.filter((r) => r.label === "Users");
  // Day index 0 is the oldest; values come from a fixed formula (no randomness).
  expect(revenue[0].value).toBe(1000); // round(1000 + 0 + 200*sin(0))
  expect(users[0].value).toBe(620); //   round(500 + 0 + 120*cos(0))
  // Newest row is anchored at `now`; oldest is now - 89 days.
  expect(+revenue.at(-1)!.recordedAt).toBe(+NOW);
  expect(+revenue[0].recordedAt).toBe(+NOW - (SAMPLE_DAYS - 1) * DAY_MS);
  // Every row carries the userId.
  expect(rows.every((r) => r.userId === "user-1")).toBe(true);
});
