import { describe, expect, it, vi } from "vitest";
import {
  BUN_COMPILER_DESCRIPTOR,
  BunAdapter,
  BunAdapterError,
  type BunRuntimeContext,
  type BunRuntimeRole,
} from "@bunwire/bun";
import {
  APPLICATION_CONTEXT,
  Application,
  defineApp,
  defineRuntimeRegistry,
} from "@bunwire/core";

describe("Bun Milestone 1 — adapter foundation and runtime roles", () => {
  it("exports a canonical empty compiler descriptor", () => {
    expect(BUN_COMPILER_DESCRIPTOR.id).toBe("bun.adapter");
    expect(BUN_COMPILER_DESCRIPTOR.classKinds).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.classDecorators).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.methodKinds).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.methodDecorators).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.parameterInjectors).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.metadataHandlers).toEqual([]);
    expect(Object.isFrozen(BUN_COMPILER_DESCRIPTOR)).toBe(true);
    expect(BunAdapter.compiler).toBe(BUN_COMPILER_DESCRIPTOR);
  });

  it("attaches to the same Core Application and defaults to the http role", async () => {
    const app = defineApp();
    const configured = app
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry());

    expect(configured).toBe(app);
    expect(configured).toBeInstanceOf(Application);
    await configured.start();

    const context = configured.rootContainer.get(APPLICATION_CONTEXT) as BunRuntimeContext;
    expect(context).toEqual({ role: "http" });
    expect(Object.isFrozen(context)).toBe(true);
    await configured.stop();
  });

  it.each(["http", "worker", "scheduler", "command"] satisfies BunRuntimeRole[])(
    "starts and stops the %s role without starting Bun.serve()",
    async (role) => {
      const serve = vi.fn();
      const previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
      Object.defineProperty(globalThis, "Bun", {
        configurable: true,
        value: Object.freeze({ serve }),
      });
      try {
        const app = defineApp()
          .withAdapter(new BunAdapter({ role, handleSignals: false }))
          .withRuntimeRegistry(defineRuntimeRegistry());

        await app.start();
        expect((app.rootContainer.get(APPLICATION_CONTEXT) as BunRuntimeContext).role).toBe(role);
        expect(serve).not.toHaveBeenCalled();
        await app.stop();
      } finally {
        if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
        else Reflect.deleteProperty(globalThis, "Bun");
      }
    },
  );

  it("rejects invalid options and manual application context", async () => {
    expect(() => new BunAdapter(null as never)).toThrow(BunAdapterError);
    expect(() => new BunAdapter({ role: "invalid" as BunRuntimeRole })).toThrow(
      /role must be one of http, worker, scheduler, or command/i,
    );
    expect(() => new BunAdapter({ handleSignals: "yes" as never })).toThrow(
      /handleSignals must be a boolean/i,
    );

    const app = defineApp()
      .withContext({ external: true })
      .withAdapter(new BunAdapter({ handleSignals: false }));
    await expect(app.start()).rejects.toThrow(/cannot consume Application\.withContext/i);
    expect(app.state).toBe("failed");
  });

  it("installs signal handlers after startup and removes only its handlers on stop", async () => {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const unrelated = vi.fn();
    process.on("SIGTERM", unrelated);
    const app = defineApp()
      .withAdapter(new BunAdapter())
      .withRuntimeRegistry(defineRuntimeRegistry());

    try {
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
      await app.start();
      expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 2);
      await app.stop();
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
      expect(process.listeners("SIGTERM")).toContain(unrelated);
    } finally {
      process.off("SIGTERM", unrelated);
      await app.stop().catch(() => undefined);
    }
  });

  it("does not install signal handlers when automatic handling is disabled", async () => {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const app = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry());

    await app.start();
    expect(process.listenerCount("SIGINT")).toBe(beforeInt);
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
    await app.stop();
  });
});
