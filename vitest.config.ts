import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/node/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Use forks pool to run in native Node.js environment
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ["--experimental-sqlite"],
      },
    },
    server: {
      deps: {
        // Don't transform these with Vite - load as native Node modules
        external: [/^node:/, /mod\.ts$/, /src\/callback\.ts$/],
      },
    },
  },
  resolve: {
    alias: {
      // Path alias for Drizzle's shared tests
      "~": resolve(__dirname, "tests/node"),
    },
  },
});
