import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "BunwireMilestone11Smoke",
    identifier: "dev.bunwire.milestone11-smoke",
    version: "0.0.1",
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts", tsconfig: "tsconfig.json" },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts", tsconfig: "tsconfig.json" },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
    mac: { bundleCEF: false, codesign: false, createDmg: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
