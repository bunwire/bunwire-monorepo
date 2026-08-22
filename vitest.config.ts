import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
  resolve: {
    alias: {
      "@bunwire/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@bunwire/vite": fileURLToPath(new URL("./packages/vite/src/index.ts", import.meta.url)),
      "@bunwire/electrobun": fileURLToPath(new URL("./packages/electrobun/src/index.ts", import.meta.url)),
      "electrobun/bun": fileURLToPath(new URL("./tests/fixtures/milestone-11-electrobun/fake-native.ts", import.meta.url)),
      "@bunwire/test-analysis-extensions": fileURLToPath(new URL("./tests/fixtures/milestone-8-analysis/extensions.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    coverage: {
      include: ["packages/core/src/**/*.ts"],
    },
  },
});
