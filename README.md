# Hackathon Starter

<!-- TODO: replace OWNER/REPO with your GitHub slug once the repo has a remote. -->
![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

A deployed, tested Next.js starter: authentication, Claude, uploads, and charts.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in values (`npx auth secret` for `AUTH_SECRET`).
3. `npm run db:up` — start dev and test Postgres (Docker).
4. `npx prisma migrate deploy && npx prisma db seed` — set up the dev DB.
5. `npm run dev` — start the app on http://localhost:3000.

## Testing

- `npm test` — unit + component + integration (Vitest)
- `npm run test:coverage` — the above with coverage thresholds enforced (90% `src/lib`, 80% global)
- `npm run test:e2e` — Playwright end-to-end (runs the app on port 3100 against the test DB)
- `npm run test:ci` — everything with coverage thresholds enforced

> The e2e suite runs on port **3100** (not the dev server's 3000) so it never collides with a running `next dev`.
