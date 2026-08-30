import { describe, expect, it } from "vitest";
import {
  checkReleaseBoundaries,
  findCrossPackageSourceImports,
  findForbiddenRuntimeDiscoveryImports,
  findVitePlatformTerms,
} from "../../scripts/check-boundaries.mjs";

describe("Milestone 13 — release architecture gates", () => {
  it("rejects platform branches in the generic Vite/compiler package", () => {
    expect(findVitePlatformTerms([{
      path: "fixture.ts",
      source: 'if (decorator === "ElectrobunRoute") return ELECTROBUN_ROUTE_KIND;',
    }])).toHaveLength(2);
  });

  it("rejects filesystem discovery imports from runtime packages", () => {
    expect(findForbiddenRuntimeDiscoveryImports([{
      path: "runtime.ts",
      source: 'import { readdir } from "node:fs/promises";',
    }])).toEqual([{ path: "runtime.ts", specifier: "node:fs/promises" }]);
  });

  it("rejects cross-package source imports", () => {
    expect(findCrossPackageSourceImports([{
      path: "adapter.ts",
      source: 'import { Container } from "../../../packages/core/src/container/container.js";',
    }])).toEqual([{
      path: "adapter.ts",
      specifier: "../../../packages/core/src/container/container.js",
    }]);
  });

  it("keeps every production package on the documented release boundaries", async () => {
    await expect(checkReleaseBoundaries(process.cwd())).resolves.toEqual({
      coreImports: [],
      vitePlatformTerms: [],
      runtimeDiscoveryImports: [],
      bunGlobalContext: [],
      crossPackageSourceImports: [],
    });
  });
});
