import { defineConfig } from "vite";
import { bunwire } from "@bunwire/vite";

export default defineConfig({
  plugins: [bunwire()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: { input: "./src/frontend.ts" },
  },
});
