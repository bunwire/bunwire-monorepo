import { describe, expect, it } from "vitest";
import {
  checkCoreBoundaries,
  findForbiddenBunGlobalContext,
  findForbiddenCoreImports,
} from "../../scripts/check-boundaries.mjs";

describe("package boundaries", () => {
  it("rejects a deliberate Core to Vite import", () => {
    expect(findForbiddenCoreImports([
      { path: "fixture.ts", source: 'import { plugin } from "@bunwire/vite";' },
    ])).toEqual([{ path: "fixture.ts", specifier: "@bunwire/vite" }]);
  });

  it("rejects a deliberate Core to Electrobun import", () => {
    expect(findForbiddenCoreImports([
      { path: "fixture.ts", source: 'export { Window } from "@bunwire/electrobun";' },
    ])).toEqual([{ path: "fixture.ts", specifier: "@bunwire/electrobun" }]);
  });

  it("rejects a deliberate Core to Bun import", () => {
    expect(findForbiddenCoreImports([
      { path: "fixture.ts", source: 'export { BunAdapter } from "@bunwire/bun";' },
    ])).toEqual([{ path: "fixture.ts", specifier: "@bunwire/bun" }]);
  });

  it("rejects AsyncLocalStorage as Bun contextual-resolution state", () => {
    expect(findForbiddenBunGlobalContext([{
      path: "fixture.ts",
      source: 'import { AsyncLocalStorage } from "node:async_hooks";',
    }])).toHaveLength(2);
  });

  it("accepts the actual Core source tree", async () => {
    await expect(checkCoreBoundaries(process.cwd())).resolves.toEqual([]);
  });
});
