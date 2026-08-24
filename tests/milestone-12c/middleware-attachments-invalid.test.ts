import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ElectrobunAdapter } from "@bunwire/electrobun";
import { aggregateCompilerExtensions, analyzeBunwireProgram } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12c-attachments");
const extensions = aggregateCompilerExtensions(ElectrobunAdapter.compiler);

function expectFailure(file: string, code: string, message: RegExp): void {
  try {
    analyzeBunwireProgram({
      projectRoot: repositoryRoot,
      sourceFiles: [
        path.join(fixtureRoot, "valid/middleware.ts"),
        path.join(fixtureRoot, file),
      ],
      extensions,
      compilerOptions: {
        baseUrl: repositoryRoot,
        paths: {
          "@bunwire/core": ["packages/core/src/index.ts"],
          "@bunwire/electrobun": ["packages/electrobun/src/index.ts"],
          "electrobun/bun": ["tests/fixtures/milestone-11-electrobun/fake-native.ts"],
        },
      },
    });
  } catch (error) {
    expect(error).toMatchObject({
      code,
      message: expect.stringMatching(message),
      location: expect.objectContaining({ filePath: expect.stringContaining(file) }),
    });
    return;
  }
  throw new Error(`Expected ${file} to fail.`);
}

describe("Middleware Redesign 12C — attachment diagnostics", () => {
  it.each([
    ["invalid-unknown-alias.ts", /unknown middleware alias/i],
    ["invalid-empty-reference.ts", /names must not be empty/i],
    ["invalid-empty-name.ts", /names must not be empty/i],
    ["invalid-empty-parameter.ts", /empty parameter/i],
    ["invalid-middle-parameter.ts", /empty parameter/i],
    ["invalid-escaping.ts", /do not support escaping/i],
    ["invalid-escaping-colon.ts", /do not support escaping/i],
    ["invalid-no-arguments.ts", /at least one middleware reference/i],
    ["invalid-identifier.ts", /must be a direct string literal/i],
    ["invalid-template.ts", /direct middleware class reference or string literal/i],
    ["invalid-call.ts", /direct middleware class reference or string literal/i],
    ["invalid-target.ts", /not a canonical managed middleware class/i],
    ["invalid-counterfeit-middleware.ts", /not a canonical managed middleware class/i],
    ["invalid-class-callback.ts", /not a canonical managed middleware class/i],
  ] as const)("rejects malformed reference in %s", (file, message) => {
    expectFailure(file, "MIDDLEWARE_ATTACHMENT_INVALID", message);
  });

  it.each([
    "invalid-class-service.ts",
    "invalid-class-unmanaged.ts",
    "invalid-method-undecorated.ts",
    "invalid-member-property.ts",
    "invalid-method-static.ts",
    "invalid-method-abstract.ts",
  ] as const)("rejects unsupported placement in %s", (file) => {
    expectFailure(file, "MIDDLEWARE_ATTACHMENT_INVALID", /@Use\(\).*Controller|concrete|managed/i);
  });

  it("rejects a counterfeit @Use() symbol", () => {
    expectFailure("invalid-counterfeit-use.ts", "DECORATOR_IDENTITY_CONFLICT", /claims registered ID.*core\.use/i);
  });

  it("retains middleware export validation for attachment targets", () => {
    expectFailure("invalid-unexported-middleware.ts", "MIDDLEWARE_CLASS_INVALID", /exported directly/i);
  });
});
