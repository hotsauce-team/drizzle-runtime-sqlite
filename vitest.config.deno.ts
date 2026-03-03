import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/deno/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      // Path alias for Drizzle's shared tests
      "~": new URL("./tests/deno", import.meta.url).pathname,
    },
  },
});
