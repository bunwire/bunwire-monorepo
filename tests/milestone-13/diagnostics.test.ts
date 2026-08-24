import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BunwireCompilerError,
  discoverBootstrapAdapter,
} from "@bunwire/vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/milestone-7-discovery");

describe("Milestone 13 — polished compiler diagnostics", () => {
  it("retains the exact failing bootstrap expression span", async () => {
    const bootstrap = path.join(fixtureRoot, "invalid/bootstrap-factory.ts");
    let error: unknown;
    try {
      await discoverBootstrapAdapter(bootstrap);
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(BunwireCompilerError);
    expect(error).toMatchObject({
      code: "ADAPTER_EXPRESSION_UNRESOLVABLE",
      filePath: bootstrap,
      location: {
        filePath: bootstrap,
        line: expect.any(Number),
        column: expect.any(Number),
        endLine: expect.any(Number),
        endColumn: expect.any(Number),
      },
      message: expect.stringMatching(/direct "new ImportedAdapter/i),
    });
    const location = (error as BunwireCompilerError).location!;
    expect(location.line).toBeGreaterThan(0);
    expect(location.column).toBeGreaterThan(0);
    expect(location.endLine > location.line || location.endColumn > location.column).toBe(true);
  });
});
