# Hackathon Starter

![CI](https://github.com/RainerGaier/OVT_Test/actions/workflows/ci.yml/badge.svg)

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

## Deployment

- **App:** Vercel. Build command (in `vercel.json`) runs `prisma migrate deploy` only when `VERCEL_ENV=production`; previews build without migrating.
- **Database:** Railway Postgres with public networking. Production `DATABASE_URL` carries `?connection_limit=1&pool_timeout=20`.
- **Auth base URL:** on Vercel, set `AUTH_TRUST_HOST=true` and leave `AUTH_URL` unset — Auth.js infers the callback base URL from each deployment's host, so production and every preview URL work unchanged.
- Preview deployments share the production database but never migrate it: a branch needing a new migration only works once merged and deployed to production.
