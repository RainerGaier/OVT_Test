# Deployment Runbook — Vercel + Railway

A tick-through guide for deploying this app to production and rehearsing it.
The code is already wired for this: [`vercel.json`](../vercel.json) gates the
database migration to production only, and on Vercel the app infers its own URL
from the request host. You provide the platforms and the environment variables.

**Division of labour:** everything below is done in the Railway and Vercel
dashboards (and your terminal for the secret). No code changes are required.

---

## 0. Pre-flight

- [ ] `master` is pushed and green in CI — check
      <https://github.com/RainerGaier/OVT_Test/actions>. CI runs lint, type-check,
      the full Vitest suite, `next build`, and the Playwright e2e before you deploy.
- [ ] You have a Railway account and a Vercel account.
- [ ] Vercel can access the `RainerGaier/OVT_Test` GitHub repo.

> If CI is red, fix that first — a failing build here will also fail on Vercel.

---

## 1. Railway — Postgres

- [ ] Create a new **Postgres** service.
- [ ] Enable **public networking** (Vercel connects from outside Railway's
      private network — without this, connections time out).
- [ ] Copy the connection string (`postgresql://USER:PASSWORD@HOST:PORT/DB`).
- [ ] **Append** the serverless pool params so it ends with:
      `?connection_limit=1&pool_timeout=20`
      Full example:
      `postgresql://postgres:xxxx@yyyy.proxy.rlwy.net:12345/railway?connection_limit=1&pool_timeout=20`

> Why `connection_limit=1`: each Vercel serverless invocation opens its own
> client; a low per-instance limit prevents exhausting Postgres connections.

---

## 2. Vercel — import + environment variables

- [ ] Import the `RainerGaier/OVT_Test` repo as a new Vercel project.
- [ ] Leave the framework preset as **Next.js**. Do **not** override the build
      command — `vercel.json` already sets it.
- [ ] Generate a **fresh** production auth secret (do NOT reuse the dev one):
      ```bash
      npx auth secret
      ```
- [ ] Set these environment variables for **Production _and_ Preview**:

  | Variable | Value | Notes |
  |---|---|---|
  | `DATABASE_URL` | Railway string **with** `?connection_limit=1&pool_timeout=20` | from step 1 |
  | `AUTH_SECRET` | output of `npx auth secret` | fresh, production-only |
  | `AUTH_TRUST_HOST` | `true` | lets Auth.js trust the deployment host |
  | `AUTH_URL` | **(unset — do not add)** | inferred from the request host |

- [ ] Do **NOT** set `DATABASE_URL_TEST` on Vercel — it is local/CI only.

> `AUTH_URL` must stay unset so the same config works for production *and* every
> preview URL. Setting it would pin callbacks to one host and break previews.

---

## 3. First production deploy

- [ ] Trigger a production deploy (deploy `master`, or `vercel --prod`).
- [ ] Watch the build log. Expected sequence from `vercel.json`:
      `prisma generate` → (production only) `prisma migrate deploy` → `next build`.
- [ ] Confirm `prisma migrate deploy` applied the `init` migration to Railway
      (the build log shows the migration name; Railway's data now has the tables).

> Previews run `prisma generate && next build` only — **no** migrate. A branch
> that needs a new migration only works once merged to `master` and deployed to
> production.

---

## 4. Production rehearsal

Against the live **production** URL, tick each only when it passes:

- [ ] Landing page loads.
- [ ] Visiting `/dashboard` while signed out redirects to `/signin`.
- [ ] Sign up creates an account (`/signup`).
- [ ] Sign in succeeds and lands on `/dashboard` showing the signed-in email.
- [ ] Push a throwaway branch → open its **preview** URL → sign in works
      (proves `AUTH_TRUST_HOST` resolves the preview host).
- [ ] Confirm that preview deploy did **not** run a migration (Railway migration
      history unchanged since the production deploy).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails at `prisma migrate deploy` | `DATABASE_URL` wrong / Railway public networking off | Recheck the string and that public networking is enabled |
| Connection timeouts at runtime | private-only Railway networking, or missing pool params | Enable public networking; append `?connection_limit=1&pool_timeout=20` |
| Sign-in redirects to a wrong/empty host | `AUTH_TRUST_HOST` missing, or `AUTH_URL` set | Set `AUTH_TRUST_HOST=true`; remove `AUTH_URL` |
| "Too many connections" under load | `connection_limit` not set | Ensure `connection_limit=1` in `DATABASE_URL` |
| Preview can't sign in | env vars only set for Production | Add the same vars to the Preview scope |

---

## Notes

- **Prisma version:** the project is pinned to Prisma 6 (`^6.19.3`). Do not let a
  dependency prompt bump it to 7 — Prisma 7 removes `url` from the schema
  `datasource` block and requires a driver-adapter migration. If you ever want 7,
  do it as a deliberate, tested branch.
- **Secrets:** real secrets live only in `.env.local` (gitignored) locally and in
  Vercel's env settings for deploys. The tracked `.env` holds non-secret dev DB
  URLs only.
- **Default branch:** `master` is the production branch on Vercel. Rename in the
  GitHub/Vercel settings if you prefer `main`.
