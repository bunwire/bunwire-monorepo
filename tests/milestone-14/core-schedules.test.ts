import { describe, expect, it } from "vitest";
import { ApplicationStateError, defineApp, defineRuntimeRegistry, defineRuntimeSchedule } from "@bunwire/core";
class Work { handle(value: string): void { void value; } }
describe("Core schedule declarations", () => {
  it("exposes a compile-only one-shot Application policy without executing arbitrary callbacks", async () => {
    let executions = 0; const app = defineApp().withSchedule(() => { executions++; }); expect(executions).toBe(0);
    expect(() => app.withSchedule(() => undefined)).toThrow(ApplicationStateError); await app.start(); expect(executions).toBe(0); await app.stop();
    expect(() => app.withSchedule(() => undefined)).toThrow(ApplicationStateError);
  });
  it("normalizes immutable optional runtime schedule records and accepts legacy omitted sidecars", () => {
    const definition = defineRuntimeSchedule({ id: "work", target: Work, execution: "job", arguments: ["x"], cron: "* * * * *", timezone: "UTC", overlap: "allow", lockFor: 100 });
    const registry = defineRuntimeRegistry({ schedules: [definition] }); expect(registry.schedules).toEqual([definition]); expect(Object.isFrozen(registry.schedules)).toBe(true); expect(Object.isFrozen(definition.arguments)).toBe(true);
    const { schedules: _ignored, ...legacy } = defineRuntimeRegistry(); expect(legacy).not.toHaveProperty("schedules");
  });
  it("rejects malformed callbacks and runtime records", () => {
    expect(() => defineApp().withSchedule(undefined as never)).toThrow(TypeError);
    expect(() => defineRuntimeSchedule({ id: "", target: Work, execution: "job", cron: "*", timezone: "UTC", overlap: "allow", lockFor: 1 })).toThrow(TypeError);
  });
});
