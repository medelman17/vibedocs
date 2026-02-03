import { defineConfig } from "vitest/config"
import path from "path"

// Configuration for pure unit tests that don't need database
// Run with: pnpm test:unit
// Much faster startup - no PGlite initialization
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup-unit.ts"],
    include: ["**/*.unit.test.ts"],
    exclude: ["node_modules", ".next"],
    // Unit tests can run in parallel - no shared state
    fileParallelism: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
