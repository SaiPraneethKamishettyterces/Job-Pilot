import { defineConfig } from "vitest/config";
import path from "path";

// Vitest reuses the app's path aliases so tests import the same way the app
// does. jsdom env covers component tests; pure server/shared unit tests run
// fine under it too.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
