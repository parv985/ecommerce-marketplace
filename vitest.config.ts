import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    /*
     * All files share one test database and clear it between tests;
     * running files in parallel would let workers wipe each other's
     * data mid-test.
     */
    fileParallelism: false,
  },
});
