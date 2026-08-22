import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./invalid/bootstrap-unattached-adapter.ts",
});
