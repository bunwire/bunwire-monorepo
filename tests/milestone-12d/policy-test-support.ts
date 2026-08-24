import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect } from "vitest";
import { defineAdapterCompilerDescriptor } from "@bunwire/core";
import { aggregateCompilerExtensions, analyzeBunwireProgram, BunwireCompilerError } from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-12d-policy");
const validRoot = path.join(fixtureRoot, "valid");
const sourceFiles = ["middleware.ts", "controllers/pattern.ts"].map((file) => path.join(validRoot, file));
const extensions = aggregateCompilerExtensions(defineAdapterCompilerDescriptor({ id: "test.policy" }));

export function createPolicyHarness(prefix: string) {
  const generatedFiles: string[] = [];
  let caseNumber = 0;

  function analyzePolicy(body: string, prelude = "") {
    const bootstrapPath = path.join(fixtureRoot, `.policy-${prefix}-${caseNumber += 1}.ts`);
    writeFileSync(bootstrapPath, `
import { defineApp } from "@bunwire/core";
import { AuthMiddleware, AuditMiddleware } from "./valid/middleware.js";
${prelude}
export default ${body};
`, "utf8");
    generatedFiles.push(bootstrapPath);
    return () => analyzeBunwireProgram({
      projectRoot: repositoryRoot,
      sourceFiles,
      bootstrapPath,
      sourceRoots: [validRoot],
      extensions,
      compilerOptions: {
        baseUrl: repositoryRoot,
        paths: { "@bunwire/core": ["packages/core/src/index.ts"] },
      },
    });
  }

  function expectFailure(run: () => unknown, code: string, text?: string) {
    try {
      run();
      throw new Error("Expected middleware policy analysis to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(BunwireCompilerError);
      expect((error as BunwireCompilerError).code).toBe(code);
      expect((error as BunwireCompilerError).location?.filePath).toContain(`.policy-${prefix}-`);
      if (text) expect((error as Error).message).toContain(text);
    }
  }

  function cleanup() {
    for (const file of generatedFiles) rmSync(file, { force: true });
  }

  return { analyzePolicy, expectFailure, cleanup };
}
