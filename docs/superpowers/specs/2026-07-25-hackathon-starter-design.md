# Hackathon Starter — Design

- **Date:** 2026-07-25
- **Status:** Approved
- **Repository:** `C:\dev\personal\hackathon-starter`

## Context

A hackathon is more than a week away and the brief will only be revealed on the
day. This project is the starter that will absorb whatever that brief turns out
to be: a deployed, tested, working application with the plumbing already solved,
so the hackathon itself is spent on the idea rather than on scaffolding.

Solo build. The solution must be deployed, and the brief requires thorough
automated testing.

### Goals

1. A single Next.js application that runs locally against Docker Postgres and
   deploys to Vercel with Railway Postgres behind it.
2. Four capabilities working end to end before the day: authentication, a Claude
   integration, file upload, and charting.
3. An automated test suite — unit, component, integration and end-to-end — with
   enforced coverage thresholds and CI.
4. The deployment path rehearsed, not theorised.

### Non-goals

- Domain modelling for a specific problem. The brief is unknown; the data model
  stays deliberately generic.
- Multi-developer workflow. This is a solo build, so shared environments,
  onboarding documentation and branch protection are out of scope.
- Production concerns beyond demo scale: horizontal scaling, backup policy,
  observability tooling, rate limiting.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Application | Next.js 15, App Router, React 19, TypeScript | One repo, one language, UI and API together. No CORS, no second deploy, no API contract to keep in sync. |
| Styling | Tailwind 4 + shadcn/ui | Matches the Energy Analyser stack, so the idiom is already familiar. |
| Data layer | Prisma + Postgres 16 | The schema will churn destructively under time pressure; Prisma's migrate-and-reset loop is the least painful place to do that. Prisma Studio also helps when debugging late. |
| Auth | Auth.js v5, Credentials provider, argon2 | Open source, no third-party account, users live in our own database. |
| LLM | `@anthropic-ai/sdk`, streaming | Most briefs reward an AI angle and streaming is fiddly to get right under pressure. |
| File storage | Vercel Blob | Native to the deployment platform: one env var, works identically locally and in production. |
| Charts | Recharts | React-native and composable. |
| Hosting | Vercel (app) + Railway (Postgres) | Both accounts already exist and both patterns are already proven on Energy Analyser. |
| Testing | Vitest, React Testing Library, Playwright | Standard, well-documented, fast. |

## Architecture

One Next.js application serves both the user interface and its own API routes.
Postgres sits behind it — in Docker locally, on Railway in production.

```
Browser ──► Vercel (Next.js: UI + /api routes) ──► Railway Postgres
                          │
                          ├──► Anthropic API   (chat slice)
                          └──► Vercel Blob     (upload slice)
```

Vercel is chosen for the application because it gives preview deployments per
branch and zero-config Next.js builds. Railway is chosen for the database
because it provides a persistent Postgres that does not sleep.

### Module boundaries

Route handlers stay thin: parse, authorise, delegate to `lib/`, return. Each
`lib/` module owns exactly one external dependency and exposes a small typed
surface:

- `lib/db.ts` — Prisma client singleton, guarded against hot-reload duplication.
- `lib/auth.ts` — Auth.js configuration and session helpers.
- `lib/anthropic.ts` — Claude client, injectable for testing.
- `lib/blob.ts` — Vercel Blob wrapper, injectable for testing.

The injectable-client rule is what makes the test suite hermetic, and it means
replacing Vercel Blob with S3 later touches one file.

## Repository layout

```
hackathon-starter/
├── docker-compose.yml           # Postgres dev + test services
├── .env.example                 # committed; documents every variable
├── .env.local                   # gitignored; real secrets
├── prisma/
│   ├── schema.prisma
│   ├── migrations/              # generated, committed
│   └── seed.ts                  # deterministic demo data
├── src/
│   ├── app/
│   │   ├── page.tsx             # public landing
│   │   ├── signin/page.tsx
│   │   ├── dashboard/page.tsx   # protected; chart + uploads
│   │   ├── chat/page.tsx        # protected; Claude
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── chat/route.ts
│   │       ├── upload/route.ts
│   │       └── readings/route.ts
│   ├── components/
│   ├── lib/
│   └── middleware.ts            # route protection
├── tests/
│   ├── factories/
│   ├── unit/
│   ├── component/
│   ├── integration/
│   └── e2e/
├── .github/workflows/ci.yml
└── docs/superpowers/specs/
```

## Data model

Auth.js contributes `User`, `Account`, `Session` and `VerificationToken` through
its Prisma adapter. Three further tables cover the remaining slices.

```prisma
model Upload {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  filename    String
  url         String
  contentType String
  size        Int
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
}

model Conversation {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  messages  Message[]
  createdAt DateTime  @default(now())
  @@index([userId, createdAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String       // "user" | "assistant"
  content        String       @db.Text
  createdAt      DateTime     @default(now())
  @@index([conversationId, createdAt])
}

model Reading {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label      String
  value      Float
  recordedAt DateTime
  @@index([userId, recordedAt])
}
```

`Reading` is intentionally generic. A labelled numeric time series repurposes
into sensor readings, transactions, scores or almost anything else the brief
demands, without a schema rewrite on the day.

Every domain table carries `userId` with a cascading delete, so authorisation
and cleanup are consistent from the first commit rather than retrofitted.

## Slices

### Auth

Email and password through the Credentials provider, hashed with argon2.

Auth.js v5 does not support database sessions alongside the Credentials
provider, so sessions are JWT-backed while users and accounts persist in
Postgres. This is the standard arrangement and costs nothing at this scale.

`/dashboard` and `/chat` are protected by `middleware.ts` and redirect
unauthenticated visitors to `/signin`. GitHub OAuth is configured but commented
out, so enabling social login on the day is a small change rather than a
rebuild.

On Vercel, `AUTH_TRUST_HOST=true` is set and `AUTH_URL` is left unset, so Auth.js
derives the callback base URL from each deployment's own host — production and
every preview URL work without per-deployment configuration.

### Chat

`POST /api/chat` accepts a conversation id and a message, validates ownership of
the conversation, calls the Anthropic SDK with streaming enabled, and pipes
tokens back to the client as a `ReadableStream`. The user message is persisted
before the call; the assembled assistant reply is persisted after it completes.

The model id is read from `ANTHROPIC_MODEL`, defaulting to `claude-sonnet-5`, so
switching models for a demo is a configuration change. The API key is read
server-side only and never reaches the browser.

### Upload

`POST /api/upload` streams the file to Vercel Blob and writes an `Upload` row
with the returned URL. The dashboard lists the signed-in user's uploads.

Images and CSV/text files up to 10 MB are accepted, validated server-side rather
than trusting the client. This path works identically in local development once
`BLOB_READ_WRITE_TOKEN` is present in `.env.local`.

### Charts

`GET /api/readings` returns readings for the signed-in user, filtered by an
optional date range. The dashboard renders them as a Recharts line chart.

The seed script generates ninety days of readings across two labelled series
using fixed dates and values — no randomness — so chart assertions in the test
suite are exact.

## Local development

Postgres runs in Docker; Next.js runs natively on the host, because
containerising the application costs fast refresh for no benefit on a solo
project.

```yaml
services:
  db:
    image: postgres:16.4
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: app
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      retries: 10

  db-test:
    image: postgres:16.4
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: test
      POSTGRES_DB: app_test
    ports: ["5433:5432"]
    tmpfs: ["/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app_test"]
      interval: 5s
      retries: 10

volumes: { pgdata: }
```

The healthcheck is load-bearing: without it, `prisma migrate` races the database
on a cold start and fails confusingly. The test database uses `tmpfs` so it is
fast and leaves nothing behind.

| Script | Purpose |
|---|---|
| `npm run db:up` | Start both Postgres services, wait for healthy |
| `npm run db:down` | Stop them |
| `npm run db:reset` | Drop, recreate, migrate and seed the dev database |
| `npm run db:studio` | Prisma Studio |
| `npm run dev` | Ensure the database is up, then start Next.js |

### Environment variables

`.env.example` is committed and documents every variable; real values live in
`.env.local`, which is gitignored.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_URL_TEST` | Test Postgres connection string (port 5433); read by Vitest and Playwright |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_TRUST_HOST` | `true` on Vercel; lets Auth.js infer the callback base URL from the request host |
| `AUTH_URL` | Callback base URL for local development only (e.g. `http://localhost:3000`); unset on Vercel |
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | Model id; defaults to `claude-sonnet-5` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access |

## Deployment

Railway hosts a Postgres service with public networking enabled, because Vercel
connects from outside Railway's private network.

Vercel builds with `prisma generate && next build`. Migrations are applied by a
build step that runs `prisma migrate deploy` only when `VERCEL_ENV=production`,
so production migrates on every prod deploy and is never migrated by hand — while
preview builds skip migration entirely and run against the schema production
currently has. This prevents an unmerged branch from reshaping the shared
database at preview-build time.

`DATABASE_URL` on Vercel carries `?connection_limit=1&pool_timeout=20`. Each
serverless function opens its own connection, and without this the database can
exhaust its connection limit during judging.

Preview deployments read and write the same Railway database as production, but
do not migrate it (see the build command above). For a solo hackathon this is the
right trade — one database, and previews can never silently reshape production's
schema — but it is a deliberate choice rather than an oversight. The consequence
to remember: a preview branch's code runs against production's current schema, so
a branch that needs a new migration won't work on preview until it is merged and
deployed to production.

The deployment is rehearsed end to end before the hackathon, with all four
slices verified working in production. Deploying for the first time under time
pressure is a common way for hackathon projects to fail.

## Error handling

Every route handler validates its input with Zod and returns typed JSON errors
with accurate status codes: 400 for invalid input, 401 unauthenticated, 403 for
another user's resource, 413 for oversized uploads, 502 when Anthropic fails.

Anthropic rate-limit (429) and overload (529) responses map to a retryable
message in the interface rather than a stack trace.

The Prisma client is a module-level singleton guarded against hot-reload
duplication, which otherwise exhausts local connections within minutes.

## Testing

Testing is a graded requirement, so the suite is a deliverable in its own right.
Implementation follows red-green-refactor per slice.

### Levels

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest (node) | `lib/` modules, Zod schemas, pure logic; external SDKs faked |
| Component | Vitest + React Testing Library (jsdom) | Chart, upload form, chat transcript |
| Integration | Vitest (node) + real Postgres | Route handlers against a real database |
| End-to-end | Playwright | Real browser against a running app, external APIs stubbed |

### Test database

Vitest `globalSetup` applies migrations once to `db-test` via
`prisma migrate deploy`. Between individual tests a helper truncates all tables
and restarts identity sequences — simpler and more reliable than transaction
rollback, which fights Prisma's connection handling.

Test data comes from typed factories in `tests/factories/` (`makeUser`,
`makeReading`, `makeUpload`, `makeConversation`) with sensible defaults and
per-test overrides, so each test states only the fields it cares about.

### External services

Anthropic and Vercel Blob are reached only through `lib/anthropic.ts` and
`lib/blob.ts`, which accept an injectable client. Unit and integration tests
substitute fakes; Playwright intercepts at the network layer and replays a
canned SSE stream for chat.

No test spends API credits, requires network access, or fails because a model
was slow — which also means the suite behaves identically in CI.

Playwright starts the application itself via its `webServer` configuration, with
`DATABASE_URL` pointed at `db-test`, so end-to-end runs never touch development
data.

### Coverage per slice

- **Auth** — password hashing and verification; signup validation; duplicate
  email rejected; wrong password rejected; session issued on success; middleware
  redirects unauthenticated users from protected routes; one user cannot read
  another user's rows.
- **Chat** — payload validation; user and assistant messages both persisted;
  streamed chunks assembled correctly; 429 and 529 mapped to retryable
  responses; conversation ownership enforced.
- **Upload** — content-type allowlist; oversized file rejected with 413; blob
  URL persisted; listing scoped to the owner; cascade delete when a user is
  removed.
- **Charts** — aggregation and date-range filtering correctness; empty state;
  user scoping; chart renders the expected series from seeded data.

The end-to-end smoke test walks sign up → sign in → dashboard renders chart →
upload appears in the list → chat returns a streamed reply.

### Scripts

```
npm test                # unit + component + integration
npm run test:unit
npm run test:component
npm run test:integration
npm run test:e2e
npm run test:watch
npm run test:coverage   # HTML + lcov report
npm run test:ci         # everything, thresholds enforced
```

Coverage uses Vitest's v8 provider with enforced thresholds: 90% on `src/lib`,
80% globally on lines and branches. Falling below fails the run.

### CI

GitHub Actions runs on every push and pull request: install dependencies,
generate the Prisma client, migrate the test database against a Postgres service
container, lint, typecheck, run unit plus integration with coverage, build, then
run Playwright.

Coverage and the Playwright HTML report upload as artifacts, and the README
carries the status badge — visible evidence of the suite without anyone needing
to run it.

## Risks

| Risk | Mitigation |
|---|---|
| First deploy fails under time pressure | Deployment rehearsed in full before the day |
| Serverless connection exhaustion | `connection_limit=1` on the production `DATABASE_URL` |
| Generic data model does not fit the brief | `Reading` is trivially replaceable; Prisma's reset loop makes schema churn cheap |
| Auth.js v5 Credentials configuration is fiddly | Built and tested well ahead of the day, not on it |
| Coverage thresholds slow hackathon-day work | Thresholds apply to `test:ci`; day-of work can run `npm test` and tighten later |
