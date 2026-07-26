# Foundation + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployed, tested Next.js application with credentials authentication, so the four hackathon capability slices (chat, upload, charts) can be built on a proven foundation.

**Architecture:** One Next.js 15 App Router application serves UI and its own `/api` routes. Postgres sits behind it (Docker locally, Railway in production). Route handlers stay thin and delegate to `src/lib/` modules that each own one external dependency. Auth.js v5 uses a Credentials provider with argon2 hashing and JWT-backed sessions, while users/accounts persist in Postgres. An edge-safe auth config drives `middleware.ts` route protection; the full Node config drives the API. The whole thing is deployed to Vercel + Railway and rehearsed before the hackathon.

**Tech Stack:** Next.js 15 (App Router, React 19, TypeScript), Tailwind 4 + shadcn/ui, Prisma + Postgres 16, Auth.js v5 (`next-auth@beta`) + `@auth/prisma-adapter` + argon2, Zod, Vitest + React Testing Library + Playwright, Docker Compose, GitHub Actions, Vercel + Railway.

**Architecture diagram:** [`docs/superpowers/architecture.drawio`](../architecture.drawio) — the full target solution (all four slices + deployment), color-coded so the green components are what this plan delivers and the amber ones are added by the later slice plans. Open it in [diagrams.net](https://app.diagrams.net) or the VS Code Draw.io extension.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `docs/superpowers/specs/2026-07-25-hackathon-starter-design.md`.

- **Framework:** Next.js 15, App Router, React 19, TypeScript.
- **Styling:** Tailwind 4 + shadcn/ui.
- **Data layer:** Prisma + Postgres 16 (Docker image `postgres:16.4`).
- **Auth:** Auth.js v5, Credentials provider, argon2. Sessions are JWT-backed; users and accounts persist in Postgres. GitHub OAuth configured but commented out.
- **Testing:** Vitest, React Testing Library, Playwright.
- **Coverage:** Vitest v8 provider, thresholds enforced — **90% on `src/lib`, 80% globally on lines and branches**. Enforced by `npm run test:ci`; day-of work may run `npm test`.
- **Ports:** dev Postgres `5432`, test Postgres `5433`. Test DB uses `tmpfs`.
- **Postgres credentials:** dev = user `app` / password `dev` / db `app`; test = user `app` / password `test` / db `app_test`.
- **Route protection:** `/dashboard` and `/chat` are protected by `middleware.ts` and redirect unauthenticated visitors to `/signin`.
- **Error handling:** every route handler validates input with Zod and returns typed JSON errors with accurate status codes (400 invalid input, 401 unauthenticated, 403 another user's resource).
- **Prisma client:** module-level singleton guarded against hot-reload duplication.
- **Every domain table carries `userId` with a cascading delete** (`onDelete: Cascade`).
- **Test DB harness:** Vitest `globalSetup` applies migrations once to `db-test` via `prisma migrate deploy`; a helper truncates all tables and restarts identity sequences between individual tests.
- **Test data:** typed factories in `tests/factories/` (`makeUser`, `makeReading`, `makeUpload`, `makeConversation`) with sensible defaults and per-test overrides. This plan implements `makeUser`; the slice plans add the others.
- **External services** are reached only through injectable-client `lib/` modules. (No external services in this plan; the pattern is established for later slices.)
- **Deployment:** Vercel (app) + Railway (Postgres, public networking). Vercel builds with `prisma generate && next build`; `prisma migrate deploy` runs **only when `VERCEL_ENV=production`**. Production `DATABASE_URL` carries `?connection_limit=1&pool_timeout=20`. On Vercel, `AUTH_TRUST_HOST=true` and `AUTH_URL` is **unset** (base URL inferred from request host); `AUTH_URL` is local-dev only. Preview deployments share the production database but never migrate it.
- **`.env.example`** is committed and documents every variable; **`.env.local`** is gitignored and holds real secrets.

### Environment variables (`.env.example`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (dev, port 5432) |
| `DATABASE_URL_TEST` | Test Postgres connection string (port 5433); read by Vitest and Playwright |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_TRUST_HOST` | `true` on Vercel; lets Auth.js infer the callback base URL from the request host |
| `AUTH_URL` | Callback base URL for local development only (e.g. `http://localhost:3000`); unset on Vercel |

> Slice plans add `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `BLOB_READ_WRITE_TOKEN`.

---

## File Structure

Files this plan creates (slice-specific files are noted as *later*):

```
hackathon-starter/
├── docker-compose.yml              # Task 2 — dev + test Postgres
├── .env.example                    # Task 2 — committed, documents every var
├── .env.local                      # Task 2 — gitignored, real secrets
├── .gitignore                      # Task 1
├── package.json                    # Task 1 (scripts grown across tasks)
├── next.config.ts                  # Task 1
├── tsconfig.json                   # Task 1
├── vitest.config.ts                # Task 1 (component) → Task 4 (adds node project)
├── vitest.setup.ts                 # Task 1 — RTL/jest-dom matchers
├── playwright.config.ts            # Task 8
├── prisma/
│   ├── schema.prisma               # Task 3 — all tables (Auth.js + Upload/Conversation/Message/Reading)
│   ├── migrations/                 # Task 3 — generated, committed
│   └── seed.ts                     # Task 3 — deterministic demo user
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Task 1
│   │   ├── globals.css             # Task 1 — Tailwind 4
│   │   ├── page.tsx                # Task 1 — public landing
│   │   ├── signin/page.tsx         # Task 7
│   │   ├── signup/page.tsx         # Task 7
│   │   ├── dashboard/page.tsx      # Task 7 — protected shell
│   │   ├── chat/page.tsx           # Task 7 — protected shell
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts  # Task 6
│   │       └── signup/route.ts     # Task 6
│   ├── components/                 # Task 1 (shadcn ui) / Task 7 (forms)
│   ├── lib/
│   │   ├── db.ts                   # Task 3 — Prisma singleton
│   │   ├── password.ts             # Task 5 — argon2 hash/verify
│   │   ├── auth.config.ts          # Task 6 — edge-safe config (middleware)
│   │   └── auth.ts                 # Task 6 — full Node config (API)
│   └── middleware.ts               # Task 7 — route protection
├── tests/
│   ├── helpers/
│   │   └── db.ts                   # Task 4 — truncateAll + testPrisma
│   ├── factories/
│   │   └── user.ts                 # Task 4 — makeUser
│   ├── unit/                       # Task 5 — password tests
│   ├── component/                  # Task 1, Task 7 — landing, signin form
│   ├── integration/                # Task 4, Task 6 — DB harness, auth
│   └── e2e/                        # Task 8 — sign up → sign in → dashboard
├── .github/workflows/ci.yml        # Task 9
└── README.md                       # Task 9 — status badge
```

---

## Task 1: Scaffold Next.js app + component-test harness

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `vitest.config.ts`, `vitest.setup.ts`
- Test: `tests/component/landing.test.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Next.js app; `src/app/page.tsx` renders a landing page containing the heading text `Hackathon Starter`; Vitest is configured with a jsdom **component** project (RTL + `@testing-library/jest-dom`). Later tasks add a `node` project (Task 4).

- [ ] **Step 1: Scaffold the app**

Run in the repo root (the directory already exists and contains `docs/` + `.git`):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

When prompted that the directory is not empty, choose to continue (it only contains `docs/` and `.git`, which the generator preserves). This produces `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/{layout,page}.tsx`, `src/app/globals.css`, and a Tailwind 4 setup.

- [ ] **Step 2: Verify the scaffold builds**

Run: `npm run build`
Expected: build completes with `✓ Compiled successfully`, no errors.

- [ ] **Step 3: Install the component-test toolchain**

```bash
npm install -D vitest@^2 @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Create `vitest.config.ts` with a single component project**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["tests/component/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
```

- [ ] **Step 6: Write the failing landing-page test**

Create `tests/component/landing.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Landing from "@/app/page";

test("landing page shows the app name", () => {
  render(<Landing />);
  expect(
    screen.getByRole("heading", { name: /hackathon starter/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run --project component`
Expected: FAIL — the scaffolded `src/app/page.tsx` has no "Hackathon Starter" heading.

- [ ] **Step 8: Replace `src/app/page.tsx` with the landing page**

```tsx
export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Hackathon Starter</h1>
      <p className="text-muted-foreground">
        Authentication, Claude, uploads, and charts — already wired up.
      </p>
      <div className="flex gap-4">
        <a className="underline" href="/signin">
          Sign in
        </a>
        <a className="underline" href="/signup">
          Sign up
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run --project component`
Expected: PASS (1 test).

- [ ] **Step 10: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button input label card
```

Accept defaults (this writes `components.json`, `src/lib/utils.ts`, and `src/components/ui/*`). Re-run `npm run build` to confirm it still compiles.

- [ ] **Step 11: Add baseline npm scripts**

Edit `package.json` `"scripts"` to include (keep the generator's `dev`/`build`/`start`/`lint`, replace `dev` as shown; Task 2 replaces `dev` again to bring the DB up first):

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test:component": "vitest run --project component",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with landing page and component-test harness"
```

---

## Task 2: Docker Postgres (dev + test) and environment files

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env.local`
- Modify: `.gitignore` (ensure `.env.local` ignored), `package.json` (db scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: two Postgres services — `db` on host port `5432`, `db-test` on host port `5433` (tmpfs). Connection strings `DATABASE_URL` (dev) and `DATABASE_URL_TEST` (test) documented in `.env.example` and set in `.env.local`. Scripts `db:up` / `db:down`.

- [ ] **Step 1: Create `docker-compose.yml`**

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

- [ ] **Step 2: Create `.env.example` (committed)**

```bash
# Postgres — dev (docker-compose service `db`, port 5432)
DATABASE_URL="postgresql://app:dev@localhost:5432/app?schema=public"

# Postgres — test (docker-compose service `db-test`, port 5433); read by Vitest and Playwright
DATABASE_URL_TEST="postgresql://app:test@localhost:5433/app_test?schema=public"

# Auth.js signing secret — generate with `npx auth secret`
AUTH_SECRET="replace-me"

# Local development only. On Vercel, leave AUTH_URL unset and set AUTH_TRUST_HOST=true.
AUTH_URL="http://localhost:3000"
```

- [ ] **Step 3: Create `.env.local` (gitignored) with real values**

```bash
DATABASE_URL="postgresql://app:dev@localhost:5432/app?schema=public"
DATABASE_URL_TEST="postgresql://app:test@localhost:5433/app_test?schema=public"
AUTH_SECRET="dev-only-secret-generate-a-real-one-with-npx-auth-secret"
AUTH_URL="http://localhost:3000"
```

- [ ] **Step 4: Confirm `.env.local` is gitignored**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (create-next-app's `.gitignore` ignores `.env*`; if it does not, append `.env.local` to `.gitignore`).

- [ ] **Step 5: Add db scripts and make `dev` bring the DB up first**

Edit `package.json` `"scripts"`, adding/replacing:

```json
{
  "scripts": {
    "dev": "npm run db:up && next dev",
    "db:up": "docker compose up -d --wait db db-test",
    "db:down": "docker compose down"
  }
}
```

- [ ] **Step 6: Verify both services come up healthy**

Run: `npm run db:up`
Expected: `docker compose ... --wait` exits 0 only after both `db` and `db-test` report healthy. Confirm with:

Run: `docker compose ps`
Expected: both services listed as `healthy`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example package.json .gitignore
git commit -m "feat: add dev and test Postgres via docker-compose with env docs"
```

---

## Task 3: Prisma schema, migrations, seed, and client singleton

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`, `prisma/migrations/**` (generated)
- Modify: `package.json` (prisma config, db scripts)
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` / `DATABASE_URL_TEST` from Task 2.
- Produces:
  - `src/lib/db.ts` exports `prisma` (a hot-reload-guarded `PrismaClient` singleton).
  - Prisma models: `User`, `Account`, `Session`, `VerificationToken` (Auth.js), plus `Upload`, `Conversation`, `Message`, `Reading` — every domain table carries `userId String` with `onDelete: Cascade`.
  - `prisma/seed.ts` inserts one deterministic demo user with email `demo@example.com`.
  - Scripts `db:reset`, `db:studio`.

- [ ] **Step 1: Install Prisma**

```bash
npm install -D prisma tsx
npm install @prisma/client
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and appends `DATABASE_URL` handling. Delete any `DATABASE_URL` line `prisma init` adds to `.env` (the project uses `.env.local`); Prisma reads `.env` **and** `.env.local` via Next.js, but for CLI commands we pass env explicitly (Task 4/CI) or rely on a root `.env` symlink. To keep CLI simple, create a root `.env` that re-exports the dev URL:

```bash
# .env  (committed-safe: contains only the local dev URL, no secrets)
DATABASE_URL="postgresql://app:dev@localhost:5432/app?schema=public"
```

Confirm `.env` is **not** gitignored for this line only; if create-next-app ignores all `.env*`, un-ignore `.env` by adding `!.env` to `.gitignore` (it holds only the local dev DB URL, no secrets).

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---- Auth.js models ----
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String?
  accounts      Account[]
  sessions      Session[]
  uploads       Upload[]
  conversations Conversation[]
  readings      Reading[]
  createdAt     DateTime  @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ---- Domain models ----
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
  role           String // "user" | "assistant"
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

> `passwordHash` is added to `User` (not in the spec's Auth.js block) because the Credentials provider needs somewhere to store the argon2 hash; it is nullable so OAuth-only users remain valid.

- [ ] **Step 3: Create `src/lib/db.ts` (hot-reload-guarded singleton)**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Create the first migration against the dev DB**

Run (with `db:up` already done):

```bash
npx prisma migrate dev --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/migration.sql`, applies it, and generates the client.

- [ ] **Step 5: Write `prisma/seed.ts` (deterministic demo user)**

```typescript
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("demo-password-123");
  await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
      passwordHash,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
```

> Install argon2 now (also used in Task 5): `npm install argon2`.

- [ ] **Step 6: Configure the seed command and add db scripts**

Add to `package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "scripts": {
    "db:reset": "prisma migrate reset --force",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 7: Write the failing schema/seed integration test**

Create `tests/integration/schema.test.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { afterAll, expect, test } from "vitest";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

afterAll(() => prisma.$disconnect());

test("demo user is present after seeding", async () => {
  const user = await prisma.user.findUnique({
    where: { email: "demo@example.com" },
  });
  expect(user).not.toBeNull();
  expect(user?.name).toBe("Demo User");
});

test("deleting a user cascades to their uploads", async () => {
  const user = await prisma.user.create({
    data: { email: "cascade@example.com" },
  });
  await prisma.upload.create({
    data: {
      userId: user.id,
      filename: "f.txt",
      url: "http://x/f.txt",
      contentType: "text/plain",
      size: 1,
    },
  });
  await prisma.user.delete({ where: { id: user.id } });
  const remaining = await prisma.upload.count({ where: { userId: user.id } });
  expect(remaining).toBe(0);
});
```

- [ ] **Step 8: Prepare the test DB and run the test to verify it fails**

The test DB has no schema yet. First apply migrations and seed to `db-test`, then run:

```bash
DATABASE_URL="postgresql://app:test@localhost:5433/app_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://app:test@localhost:5433/app_test?schema=public" npx prisma db seed
npx vitest run tests/integration/schema.test.ts
```

Expected on the **first** run before the harness exists: the test currently has no Vitest project matching `tests/integration/**` (the component project only includes `tests/component/**`), so Vitest reports **no tests found**. This confirms the node project is missing — implemented in Task 4. Proceed to Task 4, which wires the node project and re-runs this test green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema, initial migration, seed, and client singleton"
```

---

## Task 4: Test-database harness (node project, globalSetup, truncate helper, makeUser)

**Files:**
- Create: `tests/helpers/db.ts`, `tests/helpers/global-setup.ts`, `tests/factories/user.ts`
- Modify: `vitest.config.ts` (add node project), `package.json` (test scripts)
- Test: `tests/integration/schema.test.ts` (from Task 3, now runs green), `tests/integration/harness.test.ts`

**Interfaces:**
- Consumes: `src/lib/password.ts` is **not** yet available; `makeUser` hashes inline here using `argon2` directly, then Task 5 refactors it to use `hashPassword`. `DATABASE_URL_TEST` from Task 2.
- Produces:
  - `tests/helpers/db.ts` exports `testPrisma: PrismaClient` (bound to `DATABASE_URL_TEST`) and `truncateAll(): Promise<void>` (truncates every table and restarts identity).
  - `tests/factories/user.ts` exports `makeUser(overrides?: Partial<{ email: string; name: string; password: string }>): Promise<User>`.
  - Vitest `node` project including `tests/{unit,integration}/**`, with `globalSetup` applying migrations once and a `beforeEach` truncate.

- [ ] **Step 1: Create the globalSetup that migrates the test DB once**

Create `tests/helpers/global-setup.ts`:

```typescript
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
```

- [ ] **Step 2: Create the truncate helper and test Prisma client**

Create `tests/helpers/db.ts`:

```typescript
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
```

- [ ] **Step 3: Create the `makeUser` factory**

Create `tests/factories/user.ts`:

```typescript
import argon2 from "argon2";
import type { User } from "@prisma/client";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeUser(
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<User> {
  counter += 1;
  const password = overrides.password ?? "password-123";
  return testPrisma.user.create({
    data: {
      email: overrides.email ?? `user${counter}@example.com`,
      name: overrides.name ?? `User ${counter}`,
      passwordHash: await argon2.hash(password),
    },
  });
}
```

- [ ] **Step 4: Add the node project + beforeEach truncate to `vitest.config.ts`**

Replace `vitest.config.ts` with:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["tests/component/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          globalSetup: ["./tests/helpers/global-setup.ts"],
          setupFiles: ["./tests/helpers/truncate-each.ts"],
          include: ["tests/{unit,integration}/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
```

> `fileParallelism: false` keeps integration files from racing on the single shared test DB.

- [ ] **Step 5: Create the per-test truncate setup**

Create `tests/helpers/truncate-each.ts`:

```typescript
import { beforeEach } from "vitest";
import { truncateAll } from "./db";

beforeEach(async () => {
  await truncateAll();
});
```

- [ ] **Step 6: Add test scripts that load `DATABASE_URL_TEST`**

Vitest reads `.env.local` is **not** automatic for arbitrary vars; load env explicitly. Install `dotenv-cli`:

```bash
npm install -D dotenv-cli
```

Add to `package.json` `"scripts"`:

```json
{
  "scripts": {
    "test:unit": "dotenv -e .env.local -- vitest run --project node tests/unit",
    "test:integration": "dotenv -e .env.local -- vitest run --project node tests/integration",
    "test": "dotenv -e .env.local -- vitest run"
  }
}
```

> `test` runs both projects (component + node). `test:component` from Task 1 stays as-is (jsdom, no DB needed).

- [ ] **Step 7: Write the harness isolation test**

Create `tests/integration/harness.test.ts`:

```typescript
import { expect, test } from "vitest";
import { makeUser } from "../factories/user";
import { testPrisma } from "../helpers/db";

test("makeUser creates a user with a password hash", async () => {
  const user = await makeUser({ email: "a@example.com" });
  expect(user.email).toBe("a@example.com");
  expect(user.passwordHash).toBeTruthy();
});

test("each test starts from a truncated database", async () => {
  const count = await testPrisma.user.count();
  expect(count).toBe(0); // truncate ran in beforeEach, so the prior test's user is gone
});
```

- [ ] **Step 8: Update the Task 3 schema test to tolerate truncation**

The Task 3 test asserted the seeded demo user exists, but `truncateAll` now wipes it before each test. Replace `tests/integration/schema.test.ts` with a version that seeds its own data:

```typescript
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
```

- [ ] **Step 9: Run the node integration tests to verify they pass**

Run: `npm run test:integration`
Expected: PASS — globalSetup runs `prisma migrate deploy` against `db-test`, then `harness.test.ts` and `schema.test.ts` pass with per-test truncation.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: add test-database harness, truncate helper, and makeUser factory"
```

---

## Task 5: Password hashing library

**Files:**
- Create: `src/lib/password.ts`
- Modify: `tests/factories/user.ts` (use `hashPassword`)
- Test: `tests/unit/password.test.ts`

**Interfaces:**
- Consumes: `argon2`.
- Produces: `src/lib/password.ts` exports `hashPassword(plain: string): Promise<string>` and `verifyPassword(hash: string, plain: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing password test**

Create `tests/unit/password.test.ts`:

```typescript
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

test("hashPassword produces a verifiable argon2 hash", async () => {
  const hash = await hashPassword("s3cret");
  expect(hash).toMatch(/^\$argon2/);
  expect(await verifyPassword(hash, "s3cret")).toBe(true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword("s3cret");
  expect(await verifyPassword(hash, "wrong")).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `@/lib/password` does not exist.

- [ ] **Step 3: Implement `src/lib/password.ts`**

```typescript
import argon2 from "argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `makeUser` and the seed to use `hashPassword`**

In `tests/factories/user.ts`, replace `import argon2 from "argon2";` usage:

```typescript
import type { User } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { testPrisma } from "../helpers/db";

let counter = 0;

export async function makeUser(
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<User> {
  counter += 1;
  const password = overrides.password ?? "password-123";
  return testPrisma.user.create({
    data: {
      email: overrides.email ?? `user${counter}@example.com`,
      name: overrides.name ?? `User ${counter}`,
      passwordHash: await hashPassword(password),
    },
  });
}
```

In `prisma/seed.ts`, replace `import argon2` + `argon2.hash("demo-password-123")` with `hashPassword` — but seed runs via `tsx` outside the `@/` alias, so import by relative path:

```typescript
import { hashPassword } from "../src/lib/password";
```

and use `await hashPassword("demo-password-123")`.

- [ ] **Step 6: Re-run all tests to confirm no regression**

Run: `npm test`
Expected: PASS — component + node projects all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add argon2 password hashing library and use it in factory/seed"
```

---

## Task 6: Auth.js config, signup route, and credentials authorize

**Files:**
- Create: `src/lib/auth.config.ts`, `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/signup/route.ts`
- Test: `tests/integration/signup.test.ts`, `tests/integration/authorize.test.ts`

**Interfaces:**
- Consumes: `src/lib/db.ts` (`prisma`), `src/lib/password.ts` (`hashPassword`, `verifyPassword`).
- Produces:
  - `src/lib/auth.config.ts` default-exports an edge-safe `NextAuthConfig` (pages + `authorized` callback + empty providers).
  - `src/lib/auth.ts` exports `{ auth, handlers, signIn, signOut }` from `NextAuth`, with `PrismaAdapter`, `session: { strategy: "jwt" }`, and a `Credentials` provider whose `authorize` looks up the user and verifies the password.
  - `src/app/api/signup/route.ts` exports `POST` — validates `{ email, password }` with Zod (400 on invalid / duplicate email 409), hashes, creates the user, returns `{ id, email }`.
  - `signup` logic is extracted to a testable function `registerUser(input): Promise<{ id: string; email: string }>` and `authorizeCredentials(input): Promise<User | null>` so integration tests don't need HTTP.

- [ ] **Step 1: Install Auth.js v5 and the Prisma adapter**

```bash
npm install next-auth@beta @auth/prisma-adapter zod
```

- [ ] **Step 2: Write the failing signup test**

Create `tests/integration/signup.test.ts`:

```typescript
import { expect, test } from "vitest";
import { registerUser } from "@/lib/auth";
import { testPrisma } from "../helpers/db";
import { makeUser } from "../factories/user";

test("registerUser creates a user and returns id + email", async () => {
  const result = await registerUser({
    email: "new@example.com",
    password: "password-123",
  });
  expect(result.email).toBe("new@example.com");
  const stored = await testPrisma.user.findUnique({
    where: { email: "new@example.com" },
  });
  expect(stored?.passwordHash).toBeTruthy();
});

test("registerUser rejects a duplicate email", async () => {
  await makeUser({ email: "dupe@example.com" });
  await expect(
    registerUser({ email: "dupe@example.com", password: "password-123" }),
  ).rejects.toThrow(/already registered/i);
});

test("registerUser rejects invalid input", async () => {
  await expect(
    registerUser({ email: "not-an-email", password: "x" }),
  ).rejects.toThrow();
});
```

- [ ] **Step 3: Write the failing authorize test**

Create `tests/integration/authorize.test.ts`:

```typescript
import { expect, test } from "vitest";
import { authorizeCredentials } from "@/lib/auth";
import { makeUser } from "../factories/user";

test("authorizeCredentials returns the user on correct password", async () => {
  await makeUser({ email: "log@example.com", password: "right-password" });
  const user = await authorizeCredentials({
    email: "log@example.com",
    password: "right-password",
  });
  expect(user?.email).toBe("log@example.com");
});

test("authorizeCredentials returns null on wrong password", async () => {
  await makeUser({ email: "log2@example.com", password: "right-password" });
  const user = await authorizeCredentials({
    email: "log2@example.com",
    password: "wrong-password",
  });
  expect(user).toBeNull();
});

test("authorizeCredentials returns null for unknown email", async () => {
  const user = await authorizeCredentials({
    email: "nobody@example.com",
    password: "whatever",
  });
  expect(user).toBeNull();
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `@/lib/auth` and its exports do not exist.

- [ ] **Step 5: Create the edge-safe `src/lib/auth.config.ts`**

```typescript
import type { NextAuthConfig } from "next-auth";

// Edge-safe: no Prisma, no argon2. Drives middleware route protection.
export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/chat");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
```

- [ ] **Step 6: Create the full Node `src/lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import GitHub from "next-auth/providers/github"; // enable social login on the day
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import authConfig from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authorizeCredentials(input: {
  email: unknown;
  password: unknown;
}): Promise<User | null> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  return ok ? user : null;
}

export async function registerUser(input: {
  email: unknown;
  password: unknown;
}): Promise<{ id: string; email: string }> {
  const parsed = credentialsSchema.parse(input); // throws ZodError on invalid input
  const existing = await prisma.user.findUnique({
    where: { email: parsed.email },
  });
  if (existing) throw new Error("Email already registered");
  const user = await prisma.user.create({
    data: {
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
    },
  });
  return { id: user.id, email: user.email };
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) => authorizeCredentials(creds ?? {}),
    }),
    // GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET }),
  ],
});
```

- [ ] **Step 7: Run the integration tests to verify they pass**

Run: `npm run test:integration`
Expected: PASS — signup and authorize tests green.

- [ ] **Step 8: Wire the Auth.js route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 9: Create the signup HTTP route**

Create `src/app/api/signup/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { registerUser } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const { email, password } = (body ?? {}) as Record<string, unknown>;
    const user = await registerUser({ email, password });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && /already registered/i.test(err.message)) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
```

- [ ] **Step 10: Confirm the app still builds**

Run: `npm run build`
Expected: build succeeds (auth wiring compiles).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add Auth.js credentials config, signup, and authorize with tests"
```

---

## Task 7: Middleware route protection and pages

**Files:**
- Create: `src/middleware.ts`, `src/app/signin/page.tsx`, `src/app/signup/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/chat/page.tsx`, `src/components/signin-form.tsx`, `src/components/signup-form.tsx`
- Test: `tests/component/signin-form.test.tsx`, `tests/integration/authorized.test.ts`

**Interfaces:**
- Consumes: `src/lib/auth.config.ts` (edge middleware), `src/lib/auth.ts` (`auth` for server components), the `authorized` callback.
- Produces:
  - `src/middleware.ts` runs the edge auth on all routes except static assets; unauthenticated visitors to `/dashboard` or `/chat` are redirected to `/signin`.
  - `/signin` and `/signup` render forms; `/dashboard` and `/chat` are protected server components rendering a placeholder shell (slice content added later).

- [ ] **Step 1: Write the failing `authorized`-callback test**

Create `tests/integration/authorized.test.ts`:

```typescript
import { expect, test } from "vitest";
import authConfig from "@/lib/auth.config";

function check(pathname: string, loggedIn: boolean) {
  return authConfig.callbacks!.authorized!({
    auth: loggedIn ? ({ user: { id: "u1" } } as never) : null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) } as never,
  } as never);
}

test("unauthenticated users are blocked from /dashboard", () => {
  expect(check("/dashboard", false)).toBe(false);
});

test("unauthenticated users are blocked from /chat", () => {
  expect(check("/chat", false)).toBe(false);
});

test("authenticated users may access /dashboard", () => {
  expect(check("/dashboard", true)).toBe(true);
});

test("public routes are always allowed", () => {
  expect(check("/", false)).toBe(true);
  expect(check("/signin", false)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration`
Expected: FAIL — the `authorized` callback behavior is asserted but this is the first test of it; if Task 6 Step 5 was implemented correctly this may already PASS. If it passes, that is acceptable (the callback was defined in Task 6) — proceed. If it fails, fix `auth.config.ts` to match.

> This test pins the redirect contract even though the callback already exists; it guards against regressions when the matcher changes.

- [ ] **Step 3: Create `src/middleware.ts`**

```typescript
import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Write the failing signin-form component test**

Create `tests/component/signin-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SignInForm } from "@/components/signin-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

test("signin form renders email and password fields", () => {
  render(<SignInForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:component`
Expected: FAIL — `@/components/signin-form` does not exist.

- [ ] **Step 6: Create the signin form component**

Create `src/components/signin-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
    } else {
      window.location.href = "/dashboard";
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Sign in</Button>
    </form>
  );
}
```

- [ ] **Step 7: Run the component test to verify it passes**

Run: `npm run test:component`
Expected: PASS.

- [ ] **Step 8: Create the signup form component**

Create `src/components/signup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (res.ok) {
      window.location.href = "/signin";
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign up failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password (min 8 chars)</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Sign up</Button>
    </form>
  );
}
```

- [ ] **Step 9: Create the pages**

`src/app/signin/page.tsx`:

```tsx
import { SignInForm } from "@/components/signin-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm />
      <a className="text-sm underline" href="/signup">
        Need an account? Sign up
      </a>
    </main>
  );
}
```

`src/app/signup/page.tsx`:

```tsx
import { SignUpForm } from "@/components/signup-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <SignUpForm />
      <a className="text-sm underline" href="/signin">
        Already have an account? Sign in
      </a>
    </main>
  );
}
```

`src/app/dashboard/page.tsx`:

```tsx
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Signed in as {session?.user?.email}</p>
      <p className="text-muted-foreground">Charts and uploads land here.</p>
    </main>
  );
}
```

`src/app/chat/page.tsx`:

```tsx
export default function ChatPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Chat</h1>
      <p className="text-muted-foreground">Claude conversation lands here.</p>
    </main>
  );
}
```

- [ ] **Step 10: Add the `SessionProvider` to the root layout**

Wrap the app so `signIn`/session hooks work. Edit `src/app/layout.tsx` to import and wrap children:

```tsx
import { SessionProvider } from "next-auth/react";
// ...keep the generated metadata/font setup...

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

> Keep the generated `<html>`/`<body>` attributes (fonts, `className`) if create-next-app added them; only add the `SessionProvider` wrapper.

- [ ] **Step 11: Run all tests and build**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add route-protection middleware, auth pages, and forms"
```

---

## Task 8: End-to-end smoke test (sign up → sign in → dashboard)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/auth-smoke.spec.ts`
- Modify: `package.json` (`test:e2e` script), `.gitignore` (playwright artifacts)

**Interfaces:**
- Consumes: the running app; Playwright's `webServer` starts `next dev` with `DATABASE_URL` pointed at `db-test` so e2e never touches dev data.
- Produces: an e2e spec that walks sign up → sign in → dashboard renders.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";
import "dotenv/config";

const TEST_DB = process.env.DATABASE_URL_TEST!;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: TEST_DB,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret",
      AUTH_URL: "http://localhost:3000",
    },
  },
});
```

> Install `dotenv` if not already present: `npm install -D dotenv`. Run the e2e script via `dotenv-cli` (Step 5) so `DATABASE_URL_TEST` and `AUTH_SECRET` are loaded from `.env.local`.

- [ ] **Step 3: Ensure the test DB is migrated before e2e**

The e2e server uses `db-test`. Add a one-line pretest that applies migrations (idempotent):

Add to `package.json` `"scripts"`:

```json
{
  "scripts": {
    "test:e2e:migrate": "dotenv -e .env.local -- cross-env-shell \"DATABASE_URL=$DATABASE_URL_TEST prisma migrate deploy\""
  }
}
```

Install the cross-platform env helper: `npm install -D cross-env`.

- [ ] **Step 4: Write the e2e smoke spec**

Create `tests/e2e/auth-smoke.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("sign up, sign in, and reach the dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password-123";

  // Sign up
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL("**/signin");

  // Sign in
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  // Dashboard shows the signed-in email
  await expect(page.getByText(email)).toBeVisible();
});

test("unauthenticated visit to /dashboard redirects to /signin", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/signin");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});
```

- [ ] **Step 5: Add the `test:e2e` script and ignore artifacts**

Add to `package.json` `"scripts"`:

```json
{
  "scripts": {
    "test:e2e": "npm run test:e2e:migrate && dotenv -e .env.local -- playwright test"
  }
}
```

Append to `.gitignore`:

```
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 6: Run the e2e suite to verify it passes**

Run: `npm run db:up && npm run test:e2e`
Expected: both specs PASS (Playwright boots `next dev` against `db-test`, runs the flow).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add Playwright e2e smoke for sign up, sign in, dashboard"
```

---

## Task 9: Coverage thresholds, test scripts, and CI

**Files:**
- Modify: `vitest.config.ts` (coverage config), `package.json` (`test:coverage`, `test:ci`)
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: all prior test scripts.
- Produces: enforced coverage (`90% src/lib`, `80% global lines/branches`); `test:ci` running the full suite; a GitHub Actions workflow; a README with a CI status badge.

- [ ] **Step 1: Install the coverage provider**

```bash
npm install -D @vitest/coverage-v8
```

- [ ] **Step 2: Add coverage config to `vitest.config.ts`**

Add a top-level `coverage` block inside `test` (sibling of `projects`):

```typescript
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/app/**/layout.tsx",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        "src/lib/**": { lines: 90, branches: 90 },
      },
    },
```

> `src/lib` carries the 90% bar; the global floor is 80% lines/branches. shadcn `ui` primitives and layout are excluded as untested framework glue.

- [ ] **Step 3: Add coverage and CI scripts**

Add to `package.json` `"scripts"`:

```json
{
  "scripts": {
    "test:coverage": "dotenv -e .env.local -- vitest run --coverage",
    "test:ci": "dotenv -e .env.local -- vitest run --coverage && npm run test:e2e"
  }
}
```

- [ ] **Step 4: Run coverage locally to confirm thresholds pass**

Run: `npm run db:up && npm run test:coverage`
Expected: all tests pass and coverage meets thresholds. If `src/lib` is below 90%, add tests for the uncovered branch before proceeding (do not lower the threshold).

- [ ] **Step 5: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16.4
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: test
          POSTGRES_DB: app_test
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U app -d app_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL_TEST: postgresql://app:test@localhost:5433/app_test?schema=public
      DATABASE_URL: postgresql://app:test@localhost:5433/app_test?schema=public
      AUTH_SECRET: ci-secret
      AUTH_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npx vitest run --coverage
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-and-report
          path: |
            coverage/
            playwright-report/
```

> CI sets both `DATABASE_URL` and `DATABASE_URL_TEST` to the service container so Vitest globalSetup, Prisma, and Playwright's `webServer` all resolve. `.env.local` is absent in CI, so the workflow passes env directly and calls `vitest`/`playwright` without `dotenv-cli`.

- [ ] **Step 6: Create the README with a status badge**

Create `README.md` (replace `OWNER/REPO` with the actual GitHub slug):

```markdown
# Hackathon Starter

![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

A deployed, tested Next.js starter: authentication, Claude, uploads, and charts.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in values (`npx auth secret` for `AUTH_SECRET`).
3. `npm run db:up` — start dev and test Postgres.
4. `npx prisma migrate deploy && npx prisma db seed` — set up the dev DB.
5. `npm run dev` — start the app.

## Testing

- `npm test` — unit + component + integration
- `npm run test:e2e` — Playwright end-to-end
- `npm run test:ci` — everything with coverage thresholds enforced
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "ci: enforce coverage thresholds and add GitHub Actions workflow"
```

---

## Task 10: Deployment configuration and rehearsal

**Files:**
- Create: `vercel.json` (build/migration gating)
- Modify: `README.md` (deploy section)

**Interfaces:**
- Consumes: the whole foundation.
- Produces: a Vercel build that runs `prisma migrate deploy` **only** on production; Railway Postgres with `connection_limit=1&pool_timeout=20`; `AUTH_TRUST_HOST=true` / unset `AUTH_URL` on Vercel. This task is part code, part ops-checklist — the rehearsal steps are performed once against the real platforms.

- [ ] **Step 1: Add the migration-gating build command**

Create `vercel.json`:

```json
{
  "buildCommand": "prisma generate && if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && next build"
}
```

> Previews run `prisma generate && next build` (no migrate); production also runs `prisma migrate deploy`. This is the design decision from the spec: previews share the production DB but never migrate it.

- [ ] **Step 2: Verify the build command locally (non-prod path)**

Run: `VERCEL_ENV=preview bash -c 'echo "would run: prisma generate && next build (no migrate)"'`
Expected: prints the no-migrate path. (Full build is exercised by `npm run build`; this step just confirms the conditional shape.)

- [ ] **Step 3: Provision Railway Postgres**

In the Railway dashboard: create a Postgres service with **public networking enabled** (Vercel connects from outside Railway's private network). Copy the connection string.

- [ ] **Step 4: Set Vercel environment variables**

In the Vercel project settings, set for **Production and Preview**:

- `DATABASE_URL` = the Railway connection string **with** `?connection_limit=1&pool_timeout=20` appended.
- `AUTH_SECRET` = a fresh secret (`npx auth secret`).
- `AUTH_TRUST_HOST` = `true`.
- Leave `AUTH_URL` **unset** (base URL inferred from the request host).

> Do **not** set `DATABASE_URL_TEST` on Vercel — it is only used by local Vitest/Playwright and CI.

- [ ] **Step 5: First production deploy**

Push to the production branch (or `vercel --prod`). The production build runs `prisma migrate deploy`, applying the `init` migration to Railway, then `next build`.

- [ ] **Step 6: Rehearse the foundation in production (manual checklist)**

Against the deployed production URL, verify each and check the box only when it passes:

- [ ] Landing page loads.
- [ ] `/dashboard` while signed out redirects to `/signin`.
- [ ] Sign up creates an account (`/signup`).
- [ ] Sign in succeeds and lands on `/dashboard` showing the signed-in email.
- [ ] A preview deployment (push a branch) loads and can sign in — confirming `AUTH_TRUST_HOST` resolves the preview URL's host.
- [ ] Confirm a preview deploy did **not** run a migration (Railway migration history unchanged since the production deploy).

- [ ] **Step 7: Document the deploy in the README**

Append a `## Deployment` section to `README.md`:

```markdown
## Deployment

- **App:** Vercel. Build command (in `vercel.json`) runs `prisma migrate deploy` only when `VERCEL_ENV=production`; previews build without migrating.
- **Database:** Railway Postgres with public networking. Production `DATABASE_URL` carries `?connection_limit=1&pool_timeout=20`.
- **Auth base URL:** on Vercel, set `AUTH_TRUST_HOST=true` and leave `AUTH_URL` unset — Auth.js infers the callback base URL from each deployment's host, so production and every preview URL work unchanged.
- Preview deployments share the production database but never migrate it: a branch needing a new migration only works once merged and deployed to production.
```

- [ ] **Step 8: Commit**

```bash
git add vercel.json README.md
git commit -m "feat: gate preview migrations in Vercel build and document deploy"
```

---

## Self-Review Notes

Coverage of the spec's Foundation + Auth scope:

- **App + styling:** Task 1 (Next 15 App Router, Tailwind 4, shadcn).
- **Data layer:** Task 3 (Prisma, Postgres 16, all tables with `userId` + cascade, singleton).
- **Local dev:** Task 2 (Docker dev + test Postgres, healthchecks, tmpfs, `db:*` scripts), Task 3 (`db:reset`, `db:studio`).
- **Auth slice:** Tasks 5–7 (argon2, Credentials + JWT sessions, signup, authorize, middleware protection of `/dashboard` + `/chat` → `/signin`, GitHub OAuth commented out, Zod validation + typed errors).
- **Testing:** Task 1 (component harness), Task 4 (integration harness, globalSetup migrate-once, truncate-between-tests, `makeUser`), Task 5 (unit), Task 8 (e2e smoke), Task 9 (coverage thresholds, scripts, CI + badge).
- **Deployment:** Task 10 (Vercel `VERCEL_ENV` migration gate, Railway `connection_limit=1&pool_timeout=20`, `AUTH_TRUST_HOST`, rehearsal checklist).

Deferred to slice plans (out of scope here): `lib/anthropic.ts` + chat, `lib/blob.ts` + upload, `GET /api/readings` + Recharts + reading seed, and the `makeReading`/`makeUpload`/`makeConversation` factories. The cross-user authorization tests (one user cannot read another's rows) belong to the slices that introduce per-user resources.
