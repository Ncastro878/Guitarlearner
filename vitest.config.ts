import { defineConfig } from "vitest/config";

// The theory / game-logic tests are pure TypeScript (no JSX or CSS), so no
// Vite plugins are needed here — keeping this config separate from
// vite.config.ts also avoids the plugin type clash between Vite and the copy
// of Vite bundled inside Vitest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
