import { describe, expect, it, vi } from "vitest";
import {
  BUN_COMPILER_DESCRIPTOR,
  BUN_HTTP_ROUTE_KIND,
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
  it("exports BunAdapter's canonical compiler descriptor", () => {
    expect(BUN_COMPILER_DESCRIPTOR.id).toBe("bun.adapter");
    expect(BUN_COMPILER_DESCRIPTOR.classKinds).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.classDecorators).toEqual([]);
    expect(BUN_COMPILER_DESCRIPTOR.methodKinds).toEqual([BUN_HTTP_ROUTE_KIND]);
    expect(BUN_COMPILER_DESCRIPTOR.methodDecorators).toHaveLength(7);
    expect(BUN_COMPILER_DESCRIPTOR.parameterInjectors).toHaveLength(1);
    expect(BUN_COMPILER_DESCRIPTOR.metadataHandlers).toHaveLength(2);
    expect(Object.isFrozen(BUN_COMPILER_DESCRIPTOR)).toBe(true);
    expect(BunAdapter.compiler).toBe(BUN_COMPILER_DESCRIPTOR);
  });

  it("attaches to the same Core Application and defaults to the http role", async () => {
    const previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
    const stop = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "Bun", {
      configurable: true,
      value: Object.freeze({ serve: vi.fn(() => ({ stop })) }),
    });
    const app = defineApp();
    const configured = app
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry());

    expect(configured).toBe(app);
    expect(configured).toBeInstanceOf(Application);
    try {
      await configured.start();
      const context = configured.rootContainer.get(APPLICATION_CONTEXT) as BunRuntimeContext;
      expect(context).toEqual({ role: "http" });
      expect(Object.isFrozen(context)).toBe(true);
      await configured.stop();
      expect(stop).toHaveBeenCalledWith(false);
    } finally {
      if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
      else Reflect.deleteProperty(globalThis, "Bun");
    }
  });

  it.each(["http", "worker", "scheduler", "command"] satisfies BunRuntimeRole[])(
    "starts and stops the %s role with role-specific HTTP startup",
    async (role) => {
      const serve = vi.fn();
      const stop = vi.fn().mockResolvedValue(undefined);
      serve.mockReturnValue({ stop });
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
        expect(serve).toHaveBeenCalledTimes(role === "http" ? 1 : 0);
        await app.stop();
        expect(stop).toHaveBeenCalledTimes(role === "http" ? 1 : 0);
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
    const unrelated: NodeJS.SignalsListener = vi.fn();
    process.on("SIGTERM", unrelated);
    const app = defineApp()
      .withAdapter(new BunAdapter({ role: "worker" }))
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
      (process.off as unknown as (
        event: string,
        listener: NodeJS.SignalsListener,
      ) => typeof process)(
        "SIGTERM",
        unrelated,
      );
      await app.stop().catch(() => undefined);
    }
  });

  it("does not install signal handlers when automatic handling is disabled", async () => {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const app = defineApp()
      .withAdapter(new BunAdapter({ role: "worker", handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry());

    await app.start();
    expect(process.listenerCount("SIGINT")).toBe(beforeInt);
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
    await app.stop();
  });
});
