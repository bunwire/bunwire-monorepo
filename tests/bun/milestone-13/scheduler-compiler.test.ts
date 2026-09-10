import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUN_COMPILER_DESCRIPTOR, BUN_SCHEDULED_TASK_HANDLE_KIND, BUN_SCHEDULED_TASK_KIND } from "@bunwire/bun";
import { aggregateCompilerExtensions, analyzeBunwireProgram, generateRuntimeRegistryModule } from "@bunwire/vite";
const root = fileURLToPath(new URL("../../../", import.meta.url)); const fixture = path.join(root, "tests/fixtures/bun-milestone-13"); const extensions = aggregateCompilerExtensions(BUN_COMPILER_DESCRIPTOR);
function analyze(file: string) { const source = path.join(fixture, file); return analyzeBunwireProgram({ projectRoot: root, sourceFiles: [source], bootstrapPath: source, sourceRoots: [fixture], extensions,
  compilerOptions: { experimentalDecorators: true, baseUrl: root, paths: { "@bunwire/core": ["packages/core/src/index.ts"], "@bunwire/bun": ["packages/bun/src/index.ts"] } } }); }
describe("Bun schedule compilation", () => {
  it("compiles decorated tasks and static central job/task schedules deterministically", () => {
    const analysis = analyze("valid.ts"); expect(analysis.classes.filter((entry) => entry.kind === BUN_SCHEDULED_TASK_KIND)).toHaveLength(2);
    expect(analysis.classes.find((entry) => entry.name === "Cleanup")!.methods[0]!.kind).toBe(BUN_SCHEDULED_TASK_HANDLE_KIND);
    expect(analysis.schedules).toMatchObject([
      { execution: "direct", cron: "0 4 * JAN,MAR MON-FRI" },
      { id: "reports.daily", execution: "job", arguments: ["daily", -10], cron: "30 4 * * *", timezone: "Africa/Lagos", overlap: "without-overlap" },
      { id: "reconcile", execution: "direct", cron: "* * * * *" },
      { id: "reconcile.hourly", execution: "direct", cron: "15 * * * *", overlap: "without-overlap-single-server", lockFor: 500 },
    ]);
    const generated = generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") });
    expect(generated.code).toContain("schedules: ["); expect(generated.code).toContain("defineRuntimeSchedule({"); expect(generated.code).not.toContain('"lockFor": 30000'); expect(generateRuntimeRegistryModule({ analysis, extensions, modulePath: path.join(fixture, ".generated/registry.ts") }).code).toBe(generated.code);
  });
  it("rejects nonliteral arguments before evaluating invalid cadence", () => {
    expect(() => analyze("invalid.ts")).toThrowError(expect.objectContaining({ code: "DECORATOR_ARGUMENT_INVALID" }));
  });
  it.each([
    ["invalid-target.ts", "SCHEDULE_POLICY_INVALID", /allowed canonical kind/],
    ["invalid-arguments.ts", "SCHEDULE_POLICY_INVALID", /arguments do not satisfy/],
    ["invalid-cron.ts", "DECORATOR_ARGUMENT_INVALID", /five fields/],
    ["fake-decorator.ts", "SCHEDULE_POLICY_INVALID", /allowed canonical kind/],
    ["computed-policy.ts", "MIDDLEWARE_POLICY_INVALID", /non-computed property access/],
  ])("rejects invalid static schedule fixture %s", (file, code, message) => {
    expect(() => analyze(file)).toThrowError(expect.objectContaining({ code, message: expect.stringMatching(message) }));
  });
});
