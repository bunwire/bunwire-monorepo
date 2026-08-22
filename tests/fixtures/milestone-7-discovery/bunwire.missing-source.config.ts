import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src/does-not-exist",
  bootstrap: "./src/bun/bootstrap.ts",
});
