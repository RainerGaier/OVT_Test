import { expect, test } from "vitest";
import { generateSampleReadings, listReadings, SAMPLE_DAYS } from "@/lib/readings";
import { makeUser } from "../factories/user";
import { makeReading } from "../factories/reading";

test("generateSampleReadings creates 180 rows and is idempotent", async () => {
  const user = await makeUser();
  expect(await generateSampleReadings(user.id)).toBe(SAMPLE_DAYS * 2);
  // A second call replaces, not appends.
  expect(await generateSampleReadings(user.id)).toBe(SAMPLE_DAYS * 2);
  expect(await listReadings(user.id, 90)).toHaveLength(SAMPLE_DAYS * 2);
});

test("listReadings honours the day range and scopes to the user", async () => {
  const a = await makeUser({ email: "a@example.com" });
  const b = await makeUser({ email: "b@example.com" });
  await generateSampleReadings(a.id);
  await generateSampleReadings(b.id);

  const all = await listReadings(a.id, 90);
  expect(all).toHaveLength(180);
  expect(all.every((r) => r.userId === a.id)).toBe(true); // never b's rows

  const week = await listReadings(a.id, 7);
  expect(week.length).toBeGreaterThan(0);
  expect(week.length).toBeLessThan(all.length);
  // Ascending order.
  const times = week.map((r) => +r.recordedAt);
  expect(times).toEqual([...times].sort((x, y) => x - y));
});

test("listReadings returns an empty array for a user with no readings", async () => {
  const user = await makeUser({ email: "empty@example.com" });
  await makeReading((await makeUser({ email: "other@example.com" })).id);
  expect(await listReadings(user.id, 90)).toEqual([]);
});
