import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        ".next",
        "src/test/**",
        "src/db/schema/index.ts", // Re-export barrel file
        "src/db/schema/analyses.ts", // Table definitions (not business logic)
        "src/db/schema/comparisons.ts", // Table definitions (not business logic)
        "src/db/schema/organizations.ts", // Table definitions (not business logic)
        "src/db/schema/auth.ts", // Table definitions (not business logic)
        "src/db/schema/documents.ts", // Table definitions (not business logic)
        "src/db/schema/generated.ts", // Table definitions (not business logic)
        "src/db/schema/password-reset.ts", // Table definitions (not business logic)
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
