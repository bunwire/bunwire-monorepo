import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ApplicationStateError,
  defineApp,
  defineRuntimeRegistry,
  type MiddlewarePolicyRegistry,
} from "@bunwire/core";

describe("Middleware Redesign 12D — Core middleware policy composition", () => {
  it("exports the compiler-only registry contract", () => {
    expectTypeOf<MiddlewarePolicyRegistry["use"]>().toBeFunction();
    expectTypeOf<MiddlewarePolicyRegistry["group"]>().toBeFunction();
    expectTypeOf<MiddlewarePolicyRegistry["controllers"]>().toBeFunction();
  });

  it("accepts one callback without invoking or retaining it for startup", async () => {
    let executions = 0;
    const callback = () => { executions += 1; };
    const app = defineApp().withMiddlewares(callback);

    expect(executions).toBe(0);
    await app.start();
    expect(executions).toBe(0);
  });

  it("rejects malformed, repeated, and post-configuration calls", async () => {
    expect(() => defineApp().withMiddlewares(undefined as never)).toThrow(TypeError);

    const repeated = defineApp().withMiddlewares(() => undefined);
    expect(() => repeated.withMiddlewares(() => undefined)).toThrow(ApplicationStateError);

    const started = defineApp();
    await started.start();
    expect(() => started.withMiddlewares(() => undefined)).toThrow(ApplicationStateError);
  });

  it("treats a supplied runtime registry as authoritative and never rebuilds policy", async () => {
    let executions = 0;
    const registry = defineRuntimeRegistry();
    const app = defineApp()
      .withRuntimeRegistry(registry)
      .withMiddlewares(() => { executions += 1; });

    await app.start();
    expect(executions).toBe(0);
    expect(app.isRunning).toBe(true);
  });
});
