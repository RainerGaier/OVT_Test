import { defineConfig } from "@playwright/test";
import "dotenv/config";

const TEST_DB = process.env.DATABASE_URL_TEST!;

// Port 3100 (not Next's default 3000) so the e2e server never collides with a
// running `next dev` or an editor service holding 3000. Used in dev and CI alike.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // The webServer runs `next dev`, which compiles each route on its first hit.
  // Under parallel workers on a cold `.next` (always the case in CI), that
  // first-compile latency can race an assertion timeout. A retry re-runs the
  // flaked test once the route is already compiled, so it passes cleanly.
  retries: process.env.CI ? 2 : 1,
  use: { baseURL: BASE_URL },
  webServer: {
    command: `next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: TEST_DB,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret",
      AUTH_URL: BASE_URL,
      ANTHROPIC_MOCK: "1",
      ANTHROPIC_API_KEY: "e2e-not-used",
      BLOB_MOCK: "1",
      BLOB_READ_WRITE_TOKEN: "e2e-not-used",
    },
  },
});
