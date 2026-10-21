import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUN_COMPILER_DESCRIPTOR, BUN_WEBSOCKET_KIND, BUN_WEBSOCKET_MESSAGE_KIND } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateCallerContractModule, generateRuntimeRegistryModule } from "@bunwire/vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = path.join(root, "tests/fixtures/bun-milestone-15");
const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
function analyze(file: string) { const source = path.join(fixture, file); return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [source], bootstrapPath: source, sourceRoots: [fixture], extensions,
  compilerOptions: { experimentalDecorators: true, baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } } }); }

describe("Bun WebSocket compilation", () => {
  it("discovers canonical socket hooks, DI and upgrade middleware", () => {
    const analysis = analyze("valid.ts");
    const socket = analysis.classes.find((entry) => entry.kind === BUN_WEBSOCKET_KIND)!;
    expect(socket.data).toEqual({ path: "/chat/:room" });
    expect(socket.constructor?.dependencies).toHaveLength(1);
    expect(socket.methods.map((method) => method.name)).toEqual(["open", "message", "close", "drain"]);
    expect(socket.methods.find((method) => method.name === "message")?.kind).toBe(BUN_WEBSOCKET_MESSAGE_KIND);
    expect(socket.middleware.map((attachment) => attachment.parameters)).toEqual([[]]);
    expect(socket.methods.every((method) => method.middleware.length === 0)).toBe(true);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") }).code;
    expect(generated).toContain("BUN_WEBSOCKET_MESSAGE_KIND");
    expect(generated).toContain("middleware: [defineMiddlewareAttachment(");
    expect(generateCallerContractModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/client.ts") }).code).not.toContain("/chat/:room");
  });
  it.each([["duplicate.ts", /duplicate identity/i], ["conflict.ts", /duplicate identity/i], ["invalid.ts", /exactly 2 transport parameters/i]])("rejects %s", (file, message) => {
    expect(() => { const analysis = analyze(file); generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") }); }).toThrowError(expect.objectContaining({ message: expect.stringMatching(message) }));
  });
  it("places global middleware on the socket handshake", () => {
    const socket = analyze("global.ts").classes.find((entry) => entry.kind === BUN_WEBSOCKET_KIND)!;
    expect(socket.middleware).toHaveLength(1);
    expect(socket.methods[0]!.middleware).toHaveLength(0);
  });
  it("rejects lifecycle-level handshake middleware", () => {
    expect(() => analyze("invalid-method-use.ts")).toThrow(/requires a concrete managed Controller method decorator/);
  });
  it("ignores a fake local decorator", () => expect(analyze("fake.ts").classes.some((entry) => entry.kind === BUN_WEBSOCKET_KIND)).toBe(false));
});
