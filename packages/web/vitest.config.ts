import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      // App.tsx and the hooks are top-level integration glue tested via the
      // dev server / Lighthouse. main.tsx is the entrypoint. Everything else
      // stays at the 95% threshold.
      exclude: ["src/main.tsx", "src/App.tsx", "src/vite-env.d.ts", "src/hooks/**"],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
  resolve: {
    conditions: ["development", "browser"],
  },
});
