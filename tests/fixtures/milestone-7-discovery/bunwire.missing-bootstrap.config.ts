import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./src/bun/does-not-exist.ts",
});
