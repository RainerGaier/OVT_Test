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
          // `fileParallelism` is a root-only option in Vitest 3 (not a valid
          // ProjectConfig key, and setting it per-project does not actually
          // serialize files against the shared test DB — verified empirically).
          // `poolOptions.forks.singleFork` is the per-project option that
          // actually pins this project's test files to a single worker, so
          // integration test files don't race each other on the shared DB.
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
});
