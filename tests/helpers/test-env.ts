// Integration/unit tests run against the docker-compose `db-test` service
// (`DATABASE_URL_TEST`, port 5433), not the dev `db` service (`DATABASE_URL`,
// port 5432) — see docker-compose.yml. Application code (e.g. the `prisma`
// singleton in `src/lib/db.ts`, used by `@/lib/auth`'s `registerUser` /
// `authorizeCredentials`) always reads `DATABASE_URL`. Tests that exercise
// that application code and then assert against `testPrisma` therefore need
// `DATABASE_URL` to point at the same database as `DATABASE_URL_TEST`.
//
// This is a setup file (not global-setup) so it re-runs before every test
// file, ahead of that file's own imports, and applies inside the worker
// process itself rather than relying on env inheritance across a fork.
const testDbUrl = process.env.DATABASE_URL_TEST;
if (!testDbUrl) {
  throw new Error("DATABASE_URL_TEST is not set");
}
process.env.DATABASE_URL = testDbUrl;
