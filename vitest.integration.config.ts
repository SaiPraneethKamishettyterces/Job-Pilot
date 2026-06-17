import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests only — these need a reachable DATABASE_URL (a real Postgres).
// Run with `npm run test:integration` (not part of the default `npm test` / CI).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.integration.test.ts"],
  },
});
