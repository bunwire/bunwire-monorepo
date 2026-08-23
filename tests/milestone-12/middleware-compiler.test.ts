import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  Use,
  getManagedMethodMiddlewareMetadata,
} from "@bunwire/core";
import { ELECTROBUN_COMPILER_DESCRIPTOR } from "@bunwire/electrobun";
import {
  aggregateCompilerExtensions,
  analyzeBunwireProgram,
} from "@bunwire/vite";
import { describe, expect, it } from "vitest";
import {
  UserController,
  loggingMiddleware,
} from "../fixtures/milestone-12-electrobun/src/bun/application.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-8-analysis");
const extensions = aggregateCompilerExtensions(ELECTROBUN_COMPILER_DESCRIPTOR);

function analyze(fileName: string) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: [path.join(fixtureRoot, fileName)],
    extensions,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      experimentalDecorators: true,
      strict: true,
      baseUrl: repositoryRoot,
      paths: {
        "@bunwire/core": ["packages/core/src/index.ts"],
        "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
      },
    },
  });
}

describe("Milestone 12 — generated middleware attachment", () => {
  it("retains runtime metadata for the canonical aliased @Use decorator", () => {
    expect(getManagedMethodMiddlewareMetadata(UserController.prototype, "get"))
      .toEqual([loggingMiddleware]);
    expect(() => Use()).toThrow(/at least one callable/i);
  });

  it("rejects a same-ID counterfeit @Use decorator", () => {
    expect(() => analyze("invalid-shadow-use.ts")).toThrowError(expect.objectContaining({
      code: "DECORATOR_IDENTITY_CONFLICT",
      message: expect.stringMatching(/core\.use.*not the canonical/i),
    }));
  });

  it("rejects a non-callable generated middleware reference", () => {
    expect(() => analyze("invalid-use-value.ts")).toThrowError(expect.objectContaining({
      code: "MANAGED_METHOD_INVALID",
      message: expect.stringMatching(/must be callable/i),
    }));
  });
});
