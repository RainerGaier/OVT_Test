# Charts Slice Design

**Status:** Approved for planning (2026-07-30)

**Goal:** Add a readings chart to the dashboard — a Recharts multi-series line chart of
the generic `Reading` time series, with a date-range filter — completing the four
hackathon capabilities (auth, chat, upload, charts).

**Builds on:** the foundation + the chat/upload slices' patterns — thin route handlers
over `src/lib/` modules, `session.user.id`, the app shell/theme, the four-layer test
strategy. Reuses the existing `Reading` table — **no migrations**.

**Out of scope (YAGNI):** CSV→readings import (data source is seeded/generated),
manual add-reading form, area/bar chart variants, cross-user comparison.

---

## Decisions

- **Data source:** a **deterministic generator** produces 90 days × 2 labelled series
  with fixed values (no randomness). The **seed** populates the demo user. A
  freshly-signed-up user has no readings, so the dashboard shows an **empty state with a
  "Load sample data" button** that generates the same deterministic readings for them.
- **Chart:** Recharts **multi-series line chart**. Series colors are a **CVD-validated
  categorical pair** — indigo `#6366f1` (series 1) + amber `#d97706` (series 2) — which
  passed all `dataviz` validator checks (CVD ΔE ~32; lightness/chroma/contrast) in
  **both** light and dark surfaces. Wired through `--chart-1` / `--chart-2`.
- **Range filter:** a **7 / 30 / 90-day** toggle that refetches via the API's date range.
- **Where:** the dashboard gains a **"Trends"** section (alongside Uploads).

Per the `dataviz` method: 2px lines, a legend for the 2 series, a hover
tooltip + crosshair, recessive grid/axes, and axis/value/legend text in ink tokens
(never the series color). A single validated pair serves both themes.

---

## Data model

No schema changes. Existing table:

- `Reading` — `id`, `userId` (cascade), `label`, `value` (Float), `recordedAt`
  (DateTime), `@@index([userId, recordedAt])`.

---

## `lib/readings.ts`

- `SERIES: readonly string[]` — the two labels (e.g. `["Revenue", "Users"]`).
- `sampleReadings(userId, now?): { userId, label, value, recordedAt }[]` — pure,
  deterministic: for each of 90 consecutive days ending at `now` (default `new Date()`,
  injectable for tests) and each series, a fixed value from a smooth deterministic
  function of the day index and series (no randomness). 90 × 2 = **180** rows.
- `generateSampleReadings(userId): Promise<number>` — deletes the user's existing
  readings, then `createMany(sampleReadings(userId))`; returns the count created.
- `listReadings(userId, days: number): Promise<Reading[]>` — the user's readings with
  `recordedAt >= now - days`, ordered by `recordedAt` ascending.

> Ownership is enforced by scoping every query to `userId`; there is no cross-user read.

---

## API routes (thin → lib)

| Route | Purpose |
|---|---|
| `GET /api/readings?days=7\|30\|90` | The signed-in user's readings within the range |
| `POST /api/readings/sample` | Generate deterministic sample readings for the user |

### `GET /api/readings`
Auth (**401**). Parse `days` (Zod: coerce to number, one of 7/30/90; default 30;
**400** on an invalid value). Return `listReadings(userId, days)`.

### `POST /api/readings/sample`
Auth (**401**). `generateSampleReadings(userId)`. Return `{ count }` (201).

---

## Error handling

- **400** invalid `days` · **401** unauthenticated. (No blob/LLM here, so no 413/502.)

---

## UI

- **`ReadingsPanel`** (`src/components/charts/readings-panel.tsx`, client): fetches
  `GET /api/readings?days=<range>` on mount and on range change. If there are no
  readings, renders an **empty state** with a **"Load sample data"** button that POSTs
  `/api/readings/sample`, then refetches. Otherwise renders the range toggle (7/30/90)
  and the chart.
- **`ReadingsChart`** (`src/components/charts/readings-chart.tsx`, client): pivots the
  flat readings (`{ label, value, recordedAt }[]`) into Recharts' per-date shape and
  renders a `ResponsiveContainer > LineChart` with one `<Line>` per series (colors
  `var(--chart-1)` / `var(--chart-2)`, `strokeWidth={2}`), a recessive `CartesianGrid`,
  muted `XAxis`/`YAxis`, a `Legend`, and a `Tooltip`.
- **Dashboard:** a **"Trends"** `<section>` renders `<ReadingsPanel>` above the Uploads
  section.
- Chart tokens: `globals.css` `--chart-1` → `#6366f1`, `--chart-2` → `#d97706` (same in
  `:root` and `.dark`, since the pair is validated for both).

---

## Testing (four layers)

- **Unit** (`sampleReadings`): with a fixed `now`, produces exactly 180 rows, the right
  two labels, 90 distinct dates per series, and a known value at a known day index
  (asserts the deterministic formula) — no randomness.
- **Integration** (node + real Postgres): `generateSampleReadings` creates 180 rows for
  the user and is idempotent (a second call still yields 180, not 360); `listReadings`
  scopes to the user and honours the `days` range (7 → ≤ 14 rows, 90 → 180); another
  user's readings are never returned.
- **Component** (jsdom): `ReadingsPanel` — the empty state shows the "Load sample data"
  button; the range toggle renders and calls the fetch with the selected `days`. **Not**
  the Recharts SVG (Recharts needs real layout; jsdom gives it zero size). The
  `ReadingsChart` SVG is covered by e2e.
- **E2E** (Playwright): sign in → dashboard → "Trends" shows the empty state → click
  **Load sample data** → the chart renders (assert an SVG `path.recharts-line-curve`
  and both series labels in the legend appear) → switch the range to 7 days. Factory:
  `makeReading`.

> Recharts renders real SVG only in a browser, so the chart itself is an **e2e**
> concern; component tests cover the panel's control/empty-state logic.

---

## Config / dependencies

- New dependency: `recharts`. No new environment variables.
- Coverage: keep readings logic in `src/lib` (≥90%); `src/app` and the Recharts chart
  component stay outside the meaningful-unit-coverage path (chart is e2e-verified).

---

## New files at a glance

```
src/lib/readings.ts
src/app/api/readings/route.ts                (GET)
src/app/api/readings/sample/route.ts         (POST)
src/components/charts/readings-panel.tsx
src/components/charts/readings-chart.tsx
src/app/(app)/dashboard/page.tsx             (modified: add the Trends section)
prisma/seed.ts                               (modified: seed demo-user readings)
src/app/globals.css                          (modified: --chart-1/--chart-2)
tests/factories/reading.ts
tests/unit/…  tests/integration/…  tests/component/…  tests/e2e/…   (readings tests)
```
