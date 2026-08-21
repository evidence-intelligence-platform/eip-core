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
    // Pure logic tests run in node by default; the component tests that
    // render a DOM (AuthContext, Navbar) opt into jsdom per file via the
    // `// @vitest-environment jsdom` pragma on their first line.
    environment: "node",
  },
});
