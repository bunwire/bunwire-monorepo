import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "../",
  bootstrap: "./src/bun/bootstrap.ts",
});
