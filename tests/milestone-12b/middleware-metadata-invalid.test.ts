import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defineAdapterCompilerDescriptor } from "@bunwire/core";
import { aggregateCompilerExtensions, analyzeBunwireProgram } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12b-middleware");
const extensions = aggregateCompilerExtensions(
  defineAdapterCompilerDescriptor({ id: "fixture.middleware-metadata-invalid" }),
);

function analyze(...files: readonly string[]) {
  return analyzeBunwireProgram({
    projectRoot: repositoryRoot,
    sourceFiles: files.map((file) => path.join(fixtureRoot, file)),
    extensions,
    compilerOptions: {
      baseUrl: repositoryRoot,
      paths: { "@bunwire/core": ["packages/core/src/index.ts"] },
    },
  });
}

function expectFailure(files: readonly string[], message: RegExp): void {
  try {
    analyze(...files);
  } catch (error) {
    expect(error).toMatchObject({
      code: "MIDDLEWARE_METADATA_INVALID",
      message: expect.stringMatching(message),
      location: expect.objectContaining({ line: expect.any(Number), column: expect.any(Number) }),
    });
    return;
  }
  throw new Error(`Expected ${files.join(", ")} to fail middleware metadata validation.`);
}

describe("Middleware Redesign 12B — intrinsic metadata diagnostics", () => {
  it.each([
    ["invalid-metadata-identifier.ts", /direct string literal/i],
    ["invalid-metadata-call.ts", /direct array literal/i],
    ["invalid-metadata-spread.ts", /does not support spread/i],
    ["invalid-metadata-computed.ts", /computed property name/i],
    ["invalid-metadata-visibility.ts", /protected non-static/i],
    ["invalid-metadata-static.ts", /protected non-static/i],
    ["invalid-metadata-private.ts", /protected non-static/i],
    ["invalid-metadata-getter.ts", /protected instance property/i],
    ["invalid-metadata-constructor.ts", /constructor assignments are not supported/i],
    ["invalid-metadata-missing.ts", /requires a deterministic literal initializer/i],
    ["invalid-metadata-template.ts", /direct string literal/i],
    ["invalid-metadata-empty.ts", /only non-empty direct string literals/i],
    ["invalid-metadata-type.ts", /only non-empty direct string literals/i],
    ["invalid-metadata-duplicate.ts", /duplicate value.*request/i],
    ["invalid-only-except.ts", /cannot declare both.*only.*except/i],
  ] as const)("rejects %s", (file, message) => {
    expectFailure([file], message);
  });

  it("rejects duplicate aliases deterministically across input order", () => {
    const files = ["invalid-duplicate-alias-a.ts", "invalid-duplicate-alias-b.ts"] as const;
    for (const order of [files, [...files].reverse()] as const) {
      expectFailure(
        order,
        /alias "duplicate".*FirstDuplicateAliasMiddleware.*SecondDuplicateAliasMiddleware.*unique/i,
      );
    }
  });
});
