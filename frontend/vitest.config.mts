import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" → "./src/*" so tests can import like app code.
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    // Pure logic tests — nothing renders, so no jsdom needed. If component
    // rendering tests are added later, switch to environment: "jsdom" and add
    // @testing-library/react.
    environment: "node",
  },
});
