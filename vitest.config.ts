import { defineConfig } from "vitest/config"
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  server: { ws: false },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["test/markdown.test.ts", "test/media.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: ["test/markdown.test.ts", "test/media.test.ts"],
          environment: "jsdom",
        },
      },
    ],
  },
})
