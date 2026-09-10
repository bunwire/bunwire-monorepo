import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUN_COMPILER_DESCRIPTOR } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtures = path.join(root, "tests/fixtures/bun-milestone-08");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
const compilerOptions = { baseUrl: root, paths: {
  "@bunwire/core": ["packages/core/src/index.ts"],
  "@bunwire/bun": ["packages/bun/src/index.ts"],
} };

describe("Bun Milestone 8 — security compiler contributions", () => {
  it("resolves auth, guest, and can aliases plus exact direct class identities", () => {
    const fixture = path.join(fixtures, "controller.ts");
    const analysis = analyzeBunwireProgram({
      projectRoot: root,
      sourceFiles: [fixture],
      sourceRoots: [fixtures],
      extensions,
      compilerOptions,
    });
    const controller = analysis.classes.find(({ name }) => name === "SecurityController")!;
    expect(controller.methods.map((method) => method.middleware.map(({ target }) => target.exportName))).toEqual([
      ["AuthenticateMiddleware"],
      ["GuestMiddleware"],
      ["AuthorizeMiddleware"],
      ["AuthenticateMiddleware", "AuthorizeMiddleware"],
    ]);
    const contributed = analysis.classes.filter(({ name }) => [
      "AuthenticateMiddleware", "GuestMiddleware", "AuthorizeMiddleware",
    ].includes(name));
    expect(contributed.map(({ data }) => data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: "auth" }),
      expect.objectContaining({ alias: "guest" }),
      expect.objectContaining({ alias: "can" }),
    ]));
    const generated = generateRuntimeRegistryModule({
      analysis,
      extensions,
      modulePath: path.join(fixtures, "registry.generated.ts"),
    });
    expect(generated.code).toContain("AuthenticateMiddleware");
    expect(generated.code).toContain('"alias": "can"');
  });

  it("rejects application middleware aliases that collide with built-ins", () => {
    const fixture = path.join(fixtures, "invalid-collision.ts");
    expect(() => analyzeBunwireProgram({
      projectRoot: root,
      sourceFiles: [fixture],
      sourceRoots: [fixtures],
      extensions,
      compilerOptions,
    })).toThrow(/alias.*auth.*collid/i);
  });
});
