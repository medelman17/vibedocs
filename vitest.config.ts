import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        ".next",
        "test/**",
        "db/schema/index.ts", // Re-export barrel file
        "db/schema/analyses.ts", // Table definitions (not business logic)
        "db/schema/comparisons.ts", // Table definitions (not business logic)
        "db/schema/organizations.ts", // Table definitions (not business logic)
        "db/schema/auth.ts", // Table definitions (not business logic)
        "db/schema/documents.ts", // Table definitions (not business logic)
        "db/schema/generated.ts", // Table definitions (not business logic)
        "db/schema/password-reset.ts", // Table definitions (not business logic)
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
