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
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    hookTimeout: 120_000,
    coverage: {
      include: ["packages/core/src/**/*.ts"],
    },
  },
});
