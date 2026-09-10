import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src",
  bootstrap: "./src/bootstrap.ts",
  pages: {
    root: "./src/pages",
    entry: "./src/frontend.ts",
  },
});
