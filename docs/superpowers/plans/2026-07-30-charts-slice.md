# Charts Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Trends" chart to the dashboard — a Recharts multi-series line chart of the generic `Reading` time series with a 7/30/90-day range filter, backed by a deterministic sample-data generator.

**Architecture:** A thin `src/lib/readings.ts` module (pure generator + DB helpers) sits under two thin route handlers (`GET /api/readings`, `POST /api/readings/sample`). Two client components render the UI: `ReadingsPanel` (fetch + range toggle + empty state) wraps `ReadingsChart` (the Recharts SVG). The dashboard server component mounts the panel. The seed populates the demo user; fresh users load sample data on demand. Reuses the existing `Reading` table — no migration.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19, TypeScript, Prisma 6 + Postgres, Recharts, Zod, Tailwind 4, Vitest (component/node projects), Playwright (e2e).

## Global Constraints

- **Prisma stays pinned at `^6.19.3`.** Never bump to 7. Do not run `prisma migrate` — the `Reading` table already exists.
- **Next.js 16 conventions:** route handlers are `async`; read `request.nextUrl.searchParams`; there are no dynamic route params in this slice. Do not use the `middleware` name (this repo uses `src/proxy.ts`).
- **Auth:** the signed-in user is `session.user.id` (via `auth()` from `@/lib/auth`). Every readings query is scoped to `userId` — no cross-user reads.
- **Secrets:** none needed. Add no environment variables. Never write secrets to tracked files.
- **Series colors (exact, validated):** series 1 = indigo `#6366f1`, series 2 = amber `#d97706`. Same values in `:root` and `.dark`. Text/axes/legend use ink tokens, never the series color.
- **Coverage:** `src/lib/**` must stay ≥90% lines/branches; global ≥80%. `src/app/**` is excluded (e2e-verified). Keep chart-rendering logic thin and in components; keep testable logic in `src/lib`.
- **E2E runs on port 3100** with `ANTHROPIC_MOCK`/`BLOB_MOCK` set by `playwright.config.ts`. Do not add `_MOCK` vars anywhere else.
- **Deterministic data:** the generator uses NO randomness (`Math.random` forbidden). Same input → same output.

---

### Task 1: Readings library + factory

**Files:**
- Create: `src/lib/readings.ts`
- Create: `tests/factories/reading.ts`
- Test: `tests/unit/readings.test.ts`
- Test: `tests/integration/readings.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `testPrisma` from `tests/helpers/db`; the `Reading` model (`id`, `userId`, `label`, `value: Float`, `recordedAt: DateTime`).
- Produces:
  - `SERIES: readonly ["Revenue", "Users"]`
  - `SAMPLE_DAYS = 90`
  - `VALID_RANGES: readonly [7, 30, 90]`, `type RangeDays = 7 | 30 | 90`
  - `sampleReadings(userId: string, now?: Date): { userId: string; label: string; value: number; recordedAt: Date }[]` — pure, 180 rows
  - `generateSampleReadings(userId: string): Promise<number>` — replaces the user's rows, returns count (180)
  - `listReadings(userId: string, days: number): Promise<Reading[]>` — `recordedAt >= now - days`, ascending
  - `makeReading(userId, overrides?): Promise<Reading>` (factory)

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/readings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/unit/readings.test.ts`
Expected: FAIL — `@/lib/readings` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/readings.ts`**

```ts
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
```

- [ ] **Step 4: Run the unit test to confirm it passes**

Run: `npx vitest run tests/unit/readings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the factory**

Create `tests/factories/reading.ts`:

```ts
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
```

- [ ] **Step 6: Write the failing integration test**

Create `tests/integration/readings.test.ts`:

```ts
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
```

- [ ] **Step 7: Run the integration test to confirm it passes**

Run: `npx vitest run tests/integration/readings.test.ts`
Expected: PASS (3 tests). (Requires the local test DB on port 5433 — `docker compose up -d db-test`.)

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/lib/readings.ts tests/factories/reading.ts tests/unit/readings.test.ts tests/integration/readings.test.ts
git commit -m "feat: add readings library, sample generator, and factory"
```

---

### Task 2: Readings API routes

**Files:**
- Create: `src/app/api/readings/route.ts` (GET)
- Create: `src/app/api/readings/sample/route.ts` (POST)
- Test: `tests/integration/readings-routes.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `listReadings`, `generateSampleReadings`, `VALID_RANGES`, `RangeDays` from `@/lib/readings`.
- Produces: `GET /api/readings?days=7|30|90` → `Reading[]` (200), `{error}` 400/401. `POST /api/readings/sample` → `{count}` (201), `{error}` 401.

> `src/app/**` is excluded from coverage (e2e-verified), but these route tests give the task an independent gate. They mock `auth()` and run against the real test DB.

- [ ] **Step 1: Write the failing route test**

Create `tests/integration/readings-routes.test.ts`:

```ts
import { afterEach, expect, test, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

afterEach(() => auth.mockReset());

async function importRoutes() {
  const list = await import("@/app/api/readings/route");
  const sample = await import("@/app/api/readings/sample/route");
  return { GET: list.GET, POST: sample.POST };
}

test("GET returns 401 when unauthenticated", async () => {
  auth.mockResolvedValue(null);
  const { GET } = await importRoutes();
  const res = await GET(new Request("http://t/api/readings") as never);
  expect(res.status).toBe(401);
});

test("GET returns 400 for an invalid days value", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET } = await importRoutes();
  const res = await GET(new Request("http://t/api/readings?days=5") as never);
  expect(res.status).toBe(400);
});

test("POST sample generates rows, then GET returns them within range", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET, POST } = await importRoutes();

  const post = await POST();
  expect(post.status).toBe(201);
  expect(await post.json()).toEqual({ count: 180 });

  const res = await GET(new Request("http://t/api/readings?days=90") as never);
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveLength(180);
});

test("GET defaults to 30 days when days is absent", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET, POST } = await importRoutes();
  await POST();
  const res = await GET(new Request("http://t/api/readings") as never);
  const body = (await res.json()) as unknown[];
  expect(body.length).toBeGreaterThan(0);
  expect(body.length).toBeLessThan(180);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/integration/readings-routes.test.ts`
Expected: FAIL — the route modules do not exist.

- [ ] **Step 3: Implement the GET route**

Create `src/app/api/readings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listReadings, VALID_RANGES, type RangeDays } from "@/lib/readings";

const daysSchema = z.coerce
  .number()
  .refine(
    (n): n is RangeDays => (VALID_RANGES as readonly number[]).includes(n),
    { message: "days must be 7, 30, or 90" },
  );

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("days") ?? "30";
  const parsed = daysSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid days" }, { status: 400 });
  }

  return NextResponse.json(await listReadings(userId, parsed.data));
}
```

- [ ] **Step 4: Implement the POST sample route**

Create `src/app/api/readings/sample/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSampleReadings } from "@/lib/readings";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const count = await generateSampleReadings(userId);
  return NextResponse.json({ count }, { status: 201 });
}
```

- [ ] **Step 5: Run the route test to confirm it passes**

Run: `npx vitest run tests/integration/readings-routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck, lint, and commit**

Run: `npx tsc --noEmit` and `npm run lint` (expect clean), then:

```bash
git add src/app/api/readings/route.ts src/app/api/readings/sample/route.ts tests/integration/readings-routes.test.ts
git commit -m "feat: add GET /api/readings and POST /api/readings/sample"
```

---

### Task 3: Chart components + palette tokens

**Files:**
- Modify: `package.json` (add `recharts`)
- Modify: `src/app/globals.css` (chart tokens → validated hex)
- Create: `src/components/charts/readings-chart.tsx`
- Create: `src/components/charts/readings-panel.tsx`
- Test: `tests/component/readings-panel.test.tsx`

**Interfaces:**
- Consumes: `SERIES`, `VALID_RANGES`, `RangeDays` from `@/lib/readings`; `Button` from `@/components/ui/button`; the `GET /api/readings` and `POST /api/readings/sample` endpoints.
- Produces: `<ReadingsPanel />` (default-exported-free named export) mounted by the dashboard; `<ReadingsChart data={Reading[]} />`.
- Reading shape received by the panel over HTTP: `{ id, userId, label, value, recordedAt }` where `recordedAt` is an ISO string (JSON-serialized `DateTime`).

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`
Verify: `node -e "console.log(require('recharts/package.json').version)"` prints a version. Confirm Prisma stayed at 6: `node -e "console.log(require('./package.json').dependencies['@prisma/client'])"` still shows `^6.19.3`.

- [ ] **Step 2: Update the chart color tokens**

In `src/app/globals.css`, set the series-1 and series-2 chart tokens to the validated hex in BOTH the `:root` block (currently lines ~73-74) and the `.dark` block (currently lines ~108-109). Replace only `--chart-1` and `--chart-2`; leave `--chart-3/4/5` as they are.

In `:root`:
```css
  --chart-1: #6366f1;
  --chart-2: #d97706;
```
In `.dark`:
```css
  --chart-1: #6366f1;
  --chart-2: #d97706;
```

- [ ] **Step 3: Write `ReadingsChart`**

Create `src/components/charts/readings-chart.tsx`. It pivots flat readings into per-date rows and draws one line per series. Colors come from the CSS tokens; text stays in ink tokens.

```tsx
"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SERIES } from "@/lib/readings";

type Reading = { label: string; value: number; recordedAt: string };

const COLORS: Record<(typeof SERIES)[number], string> = {
  Revenue: "var(--chart-1)",
  Users: "var(--chart-2)",
};

// Pivot [{label, value, recordedAt}] into [{date, Revenue, Users}] for Recharts.
function pivot(data: Reading[]): Array<Record<string, number | string>> {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of data) {
    const date = new Date(r.recordedAt).toISOString().slice(0, 10);
    const row = byDate.get(date) ?? { date };
    row[r.label] = r.value;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function ReadingsChart({ data }: { data: Reading[] }) {
  const rows = pivot(data);
  return (
    <div className="h-72 w-full" data-testid="readings-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
            }}
          />
          <Legend />
          {SERIES.map((label) => (
            <Line
              key={label}
              type="monotone"
              dataKey={label}
              stroke={COLORS[label]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Write the failing panel test**

Create `tests/component/readings-panel.test.tsx`. Mock `ReadingsChart` (Recharts needs real layout; jsdom gives it zero size — the SVG is an e2e concern) and drive the panel's fetch/empty-state/toggle logic.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReadingsPanel } from "@/components/charts/readings-panel";

vi.mock("@/components/charts/readings-chart", () => ({
  ReadingsChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="chart-stub">{data.length} points</div>
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

test("shows the empty state and loads sample data on click", async () => {
  const user = userEvent.setup();
  // First GET: empty. POST sample. Refetch GET: one point.
  fetchMock
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse({ count: 180 }, 201))
    .mockResolvedValueOnce(
      jsonResponse([{ label: "Revenue", value: 1, recordedAt: "2026-07-30" }]),
    );

  render(<ReadingsPanel />);
  const loadBtn = await screen.findByRole("button", { name: /load sample data/i });
  await user.click(loadBtn);

  await waitFor(() => expect(screen.getByTestId("chart-stub")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/readings/sample", {
    method: "POST",
  });
});

test("changing the range refetches with the selected days", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue(
    jsonResponse([{ label: "Revenue", value: 1, recordedAt: "2026-07-30" }]),
  );

  render(<ReadingsPanel />);
  await screen.findByTestId("chart-stub");
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/readings?days=30");

  await user.click(screen.getByRole("button", { name: /^7d$/i }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith("/api/readings?days=7"),
  );
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npx vitest run tests/component/readings-panel.test.tsx`
Expected: FAIL — `@/components/charts/readings-panel` does not exist.

- [ ] **Step 6: Write `ReadingsPanel`**

Create `src/components/charts/readings-panel.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VALID_RANGES, type RangeDays } from "@/lib/readings";
import { ReadingsChart } from "@/components/charts/readings-chart";

type Reading = { label: string; value: number; recordedAt: string };

export function ReadingsPanel() {
  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<Reading[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (range: RangeDays) => {
    const res = await fetch(`/api/readings?days=${range}`);
    if (res.ok) setData((await res.json()) as Reading[]);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  async function loadSample() {
    setLoading(true);
    try {
      await fetch("/api/readings/sample", { method: "POST" });
      await load(days);
    } finally {
      setLoading(false);
    }
  }

  if (data === null) {
    return <p className="text-muted-foreground text-sm">Loading trends…</p>;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
        <p className="text-muted-foreground text-sm">
          No readings yet. Load a sample dataset to see the chart.
        </p>
        <Button onClick={loadSample} disabled={loading}>
          {loading ? "Loading…" : "Load sample data"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="group" aria-label="Date range">
        {VALID_RANGES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === days ? "default" : "outline"}
            aria-pressed={r === days}
            onClick={() => setDays(r)}
          >
            {r}d
          </Button>
        ))}
      </div>
      <ReadingsChart data={data} />
    </div>
  );
}
```

- [ ] **Step 7: Run the panel test to confirm it passes**

Run: `npx vitest run tests/component/readings-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 8: Typecheck, lint, and commit**

Run: `npx tsc --noEmit` and `npm run lint` (expect clean), then:

```bash
git add package.json package-lock.json src/app/globals.css src/components/charts/ tests/component/readings-panel.test.tsx
git commit -m "feat: add readings chart + panel components and validated chart palette"
```

---

### Task 4: Dashboard wiring, seed, and e2e

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (add the Trends section)
- Modify: `prisma/seed.ts` (seed the demo user's readings)
- Test: `tests/e2e/charts-smoke.spec.ts`

**Interfaces:**
- Consumes: `ReadingsPanel` from `@/components/charts/readings-panel`; the pure `sampleReadings` from `@/lib/readings` (seed uses its own Prisma client, not the app singleton).

- [ ] **Step 1: Add the Trends section to the dashboard**

In `src/app/(app)/dashboard/page.tsx`, add the import and a new `<section>` above the existing Uploads section. The panel is a client component and fetches its own data, so the server component just mounts it.

Add to the imports:
```tsx
import { ReadingsPanel } from "@/components/charts/readings-panel";
```

Insert this section immediately after the header `<div>` and before the Uploads `<section>`:
```tsx
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Trends</h2>
        <ReadingsPanel />
      </section>
```

- [ ] **Step 2: Seed the demo user's readings**

In `prisma/seed.ts`, capture the upserted demo user and populate its readings using the pure generator. Replace the `main` body so it reads:

```ts
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
```

Leave the existing `main().then(...).catch(...)` tail unchanged.

- [ ] **Step 3: Verify the seed runs**

Run: `npx prisma db seed`
Expected: completes with no error. (This seeds the LOCAL dev DB; safe to run repeatedly — it is idempotent.)

- [ ] **Step 4: Write the e2e smoke test**

Create `tests/e2e/charts-smoke.spec.ts`. A fresh signup has no readings, so the flow exercises the empty state → load → chart → range toggle. Recharts renders real SVG only in a browser, so this is where the chart itself is verified.

```ts
import { expect, test } from "@playwright/test";

test("dashboard Trends: empty state → load sample → chart → range toggle", async ({
  page,
}) => {
  const email = `e2e-charts-${Date.now()}@example.com`;
  const password = "password-123";

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL(/\/signin/);

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  // Fresh user: empty state, then load the sample dataset.
  await expect(
    page.getByRole("button", { name: /load sample data/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /load sample data/i }).click();

  // The Recharts SVG renders both series.
  await expect(page.locator("path.recharts-line-curve").first()).toBeVisible();
  await expect(page.getByText("Revenue")).toBeVisible();
  await expect(page.getByText("Users")).toBeVisible();

  // Switch the range to 7 days; the chart stays visible.
  await page.getByRole("button", { name: /^7d$/i }).click();
  await expect(page.locator("path.recharts-line-curve").first()).toBeVisible();
});
```

- [ ] **Step 5: Run the e2e test**

Run: `npx playwright test tests/e2e/charts-smoke.spec.ts`
Expected: PASS. (Playwright starts its own dev server on port 3100; the first run may retry once on cold compile — that is expected and configured.)

- [ ] **Step 6: Run the full suite**

Run: `npm test` (Vitest component + node projects). Expected: all pass, coverage thresholds met (`src/lib/**` ≥90%).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" prisma/seed.ts tests/e2e/charts-smoke.spec.ts
git commit -m "feat: add Trends chart section to the dashboard and seed demo readings"
```

---

## Self-Review

**Spec coverage:**
- Reading table reuse / no migration → Global Constraints + Task 1. ✓
- Deterministic 90×2 generator → Task 1 (`sampleReadings`, unit test asserts no randomness). ✓
- Seed demo user + "Load sample data" for fresh users → Task 4 seed + Task 3 panel empty state. ✓
- Recharts multi-series line chart → Task 3 `ReadingsChart`. ✓
- Validated indigo/amber palette via `--chart-1/2` → Task 3 Step 2 (exact hex, both themes). ✓
- 7/30/90 range toggle → Task 3 panel + Task 2 GET validation. ✓
- `GET /api/readings?days=`, `POST /api/readings/sample` → Task 2. ✓
- `lib/readings.ts` (`listReadings`, `generateSampleReadings`) → Task 1. ✓
- `makeReading` factory → Task 1. ✓
- Four-layer tests (unit / integration / component / e2e), chart via e2e not jsdom → Tasks 1–4. ✓
- `recharts` dependency, no new env vars → Task 3 Step 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code and exact commands. ✓

**Type consistency:** `RangeDays`/`VALID_RANGES`/`SERIES`/`SAMPLE_DAYS` defined in Task 1 and consumed unchanged in Tasks 2–3. The panel's `Reading` HTTP shape (`recordedAt: string`) is consistent between `ReadingsPanel` and `ReadingsChart`. Route names (`GET`, `POST`) match the test imports. ✓
