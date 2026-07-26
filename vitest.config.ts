import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // next-auth (pure ESM) imports bare "next/server" / "next/headers" /
    // "next/navigation" with no file extension. Next.js 16's package.json
    // has no "exports" map, so those subpaths only resolve through Node's
    // legacy CJS extension-probing (what webpack/turbopack + `require` use)
    // — not strict ESM resolution. Vitest externalizes next-auth (pure ESM)
    // for SSR and hands it to Node's native ESM loader, which enforces
    // strict resolution and throws ERR_MODULE_NOT_FOUND on these bare
    // specifiers. Inlining next-auth routes it through Vite's own resolver
    // instead, which does extension-probing like a bundler, so it resolves.
    server: {
      deps: {
        inline: [/next-auth/, /@auth\//],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/**/*.d.ts",
        // Verified end-to-end by Playwright, not by vitest: App Router pages
        // and route handlers (thin HTTP/render glue over src/lib) and the
        // Auth.js proxy wiring. Their logic lives in src/lib, which carries
        // the 90% bar. Including them here would measure e2e-only surfaces
        // against the vitest run and understate real coverage.
        "src/app/**",
        "src/proxy.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        "src/lib/**": { lines: 90, branches: 90 },
      },
    },
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
          setupFiles: [
            "./tests/helpers/test-env.ts",
            "./tests/helpers/truncate-each.ts",
          ],
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
