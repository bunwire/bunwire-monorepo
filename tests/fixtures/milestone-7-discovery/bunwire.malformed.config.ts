import { defineBunwireConfig } from "@bunwire/vite";

const sourceRoot = "./src/bun";

export default defineBunwireConfig({
  source: sourceRoot,
  bootstrap: "./src/bun/bootstrap.ts",
});
