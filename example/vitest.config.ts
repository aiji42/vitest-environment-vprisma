import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "vprisma",
    setupFiles: ["vitest-environment-vprisma/setup", "./vitest.setup"],
    globalSetup: ["./vitest.globalSetup"],
  },
});
