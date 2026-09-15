import { defineConfig } from "vitest/config";

/*
 * Unit suite for the pure business logic (money maths, message
 * contracts). Unlike the integration suite it needs no MongoDB, so it
 * runs anywhere - CI, a fresh checkout, or a sandbox without a
 * database. Run with `npm run test:unit`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
