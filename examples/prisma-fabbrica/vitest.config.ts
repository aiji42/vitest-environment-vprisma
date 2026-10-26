import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // SQLite allows only one writer at a time, so test files must not hold transactions in parallel.
    fileParallelism: false,
  },
});
