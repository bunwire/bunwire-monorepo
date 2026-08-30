import { describe, expect, it, vi } from "vitest";
import {
  BUN_EXECUTION_SCOPE,
  BUN_EXECUTION_SCOPE_DESCRIPTORS,
  BUN_EXECUTION_SCOPE_MANAGER,
  BunAdapter,
  BunExecutionScopeError,
  BunExecutionScopeManager,
  type BunChildExecutionScopeKind,
} from "@bunwire/bun";
import {
  Container,
  createToken,
  defineApp,
  defineRuntimeRegistry,
} from "@bunwire/core";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("Bun Milestone 2 — execution scopes", () => {
  it("exports frozen canonical descriptors with exact parent relationships", () => {
    expect(BUN_EXECUTION_SCOPE_DESCRIPTORS).toEqual({
      application: { id: "application", parentKinds: [] },
      "http-request": { id: "http-request", parentKinds: ["application"] },
      "queue-job": { id: "queue-job", parentKinds: ["application"] },
      command: { id: "command", parentKinds: ["application"] },
      "scheduled-task": { id: "scheduled-task", parentKinds: ["application"] },
      "websocket-connection": {
        id: "websocket-connection",
        parentKinds: ["application"],
      },
      "websocket-message": {
        id: "websocket-message",
        parentKinds: ["websocket-connection"],
      },
    });
    expect(Object.isFrozen(BUN_EXECUTION_SCOPE_DESCRIPTORS)).toBe(true);
    for (const descriptor of Object.values(BUN_EXECUTION_SCOPE_DESCRIPTORS)) {
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.parentKinds)).toBe(true);
    }
  });

  it("caches scoped services per scope while sharing application singletons", async () => {
    class ApplicationService {}
    const SCOPED = createToken<object>("test.bun.scoped");
    const root = new Container().singleton(ApplicationService);
    const manager = new BunExecutionScopeManager(root);
    const first = manager.create("http-request").scoped(SCOPED, () => ({}));
    const second = manager.create("http-request").scoped(SCOPED, () => ({}));

    expect(first.resolve(SCOPED)).toBe(first.resolve(SCOPED));
    expect(first.resolve(SCOPED)).not.toBe(second.resolve(SCOPED));
    expect(first.resolve(ApplicationService)).toBe(second.resolve(ApplicationService));
    expect(first.resolve(BUN_EXECUTION_SCOPE)).toBe(first);
    expect(second.resolve(BUN_EXECUTION_SCOPE)).toBe(second);
    expect(root.get(BUN_EXECUTION_SCOPE)).toBe(manager.applicationScope);
    expect(root.get(BUN_EXECUTION_SCOPE_MANAGER)).toBe(manager);

    await first.dispose();
    expect(root.get(ApplicationService)).toBe(second.resolve(ApplicationService));
    await manager.dispose();
  });

  it("keeps local values out of parents and siblings", async () => {
    const CURRENT = createToken<string>("test.bun.current");
    const root = new Container();
    const manager = new BunExecutionScopeManager(root);
    const request = manager.create("http-request").value(CURRENT, "request-a");
    const sibling = manager.create("http-request");

    expect(request.resolve(CURRENT)).toBe("request-a");
    expect(() => root.get(CURRENT)).toThrow(/no binding is registered/i);
    expect(() => sibling.resolve(CURRENT)).toThrow(/no binding is registered/i);
    await manager.dispose();
  });

  it("requires WebSocket messages to nest under a live connection scope", async () => {
    const CONNECTION = createToken<string>("test.bun.connection");
    const manager = new BunExecutionScopeManager(new Container());
    const firstConnection = manager
      .create("websocket-connection")
      .value(CONNECTION, "connection-a");
    const secondConnection = manager
      .create("websocket-connection")
      .value(CONNECTION, "connection-b");
    const firstMessage = manager.create("websocket-message", { parent: firstConnection });
    const secondMessage = manager.create("websocket-message", { parent: secondConnection });

    expect(firstMessage.parent).toBe(firstConnection);
    expect(firstMessage.resolve(CONNECTION)).toBe("connection-a");
    expect(secondMessage.resolve(CONNECTION)).toBe("connection-b");
    expect(() => manager.create("websocket-message")).toThrow(/requires parent kind.*websocket-connection/i);
    expect(() => manager.create("queue-job", { parent: firstConnection })).toThrow(
      /requires parent kind.*application/i,
    );

    await firstConnection.dispose();
    expect(firstMessage.state).toBe("disposed");
    expect(() => manager.create("websocket-message", { parent: firstConnection })).toThrow(
      /while it is disposed/i,
    );
    await manager.dispose();
  });

  it("allows descendants to shadow parent bindings", async () => {
    const VALUE = createToken<string>("test.bun.shadow");
    const manager = new BunExecutionScopeManager(new Container());
    const connection = manager.create("websocket-connection").value(VALUE, "connection");
    const message = manager
      .create("websocket-message", { parent: connection })
      .value(VALUE, "message");

    expect(connection.resolve(VALUE)).toBe("connection");
    expect(message.resolve(VALUE)).toBe("message");
    await manager.dispose();
  });

  it("disposes descendants and resolved resources in LIFO order", async () => {
    const order: string[] = [];
    const A = createToken<object>("test.bun.a");
    const B = createToken<object>("test.bun.b");
    const NEVER = createToken<object>("test.bun.never");
    const manager = new BunExecutionScopeManager(new Container());
    const connection = manager
      .create("websocket-connection")
      .scoped(A, () => ({}), { dispose: () => { order.push("connection-a"); } })
      .scoped(B, () => ({}), { dispose: async () => { order.push("connection-b"); } })
      .scoped(NEVER, () => ({}), { dispose: () => { order.push("unresolved"); } });
    connection.resolve(A);
    connection.resolve(B);
    manager
      .create("websocket-message", { parent: connection })
      .value(A, {}, { dispose: () => { order.push("message-one"); } });
    manager
      .create("websocket-message", { parent: connection })
      .value(A, {}, { dispose: () => { order.push("message-two"); } });

    const firstDispose = connection.dispose();
    const secondDispose = connection.dispose();
    await Promise.all([firstDispose, secondDispose]);

    expect(order).toEqual([
      "message-two",
      "message-one",
      "connection-b",
      "connection-a",
    ]);
    expect(order).not.toContain("unresolved");
    expect(connection.state).toBe("disposed");
    await manager.dispose();
  });

  it("attempts every disposer and preserves deterministic failures", async () => {
    const FIRST = createToken<object>("test.bun.failure-first");
    const SECOND = createToken<object>("test.bun.failure-second");
    const firstError = new Error("first cleanup");
    const secondError = new Error("second cleanup");
    const manager = new BunExecutionScopeManager(new Container());
    const scope = manager
      .create("queue-job")
      .value(FIRST, {}, { dispose: () => { throw firstError; } })
      .value(SECOND, {}, { dispose: () => { throw secondError; } });

    const rejection = await scope.dispose().catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([secondError, firstError]);
    expect(scope.state).toBe("disposed");
    await manager.dispose();
  });

  it("aggregates handler and disposal failures without losing either", async () => {
    const RESOURCE = createToken<object>("test.bun.run-failure");
    const handlerError = new Error("handler failed");
    const cleanupError = new Error("cleanup failed");
    const manager = new BunExecutionScopeManager(new Container());

    const rejection = await manager.run(
      "command",
      () => {
        throw handlerError;
      },
      {
        configure(scope) {
          scope.value(RESOURCE, {}, { dispose: () => { throw cleanupError; } });
        },
      },
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([handlerError, cleanupError]);
    expect(manager.activeScopeCount).toBe(0);
    await manager.dispose();
  });

  it("rejects duplicate, foreign, closing, and disposed scope use", async () => {
    const VALUE = createToken<string>("test.bun.invalid-use");
    const manager = new BunExecutionScopeManager(new Container());
    const foreignManager = new BunExecutionScopeManager(new Container());
    const scope = manager.create("http-request").value(VALUE, "first");

    expect(() => scope.value(VALUE, "second")).toThrow(/already registered locally/i);
    expect(() => manager.create("websocket-message", {
      parent: foreignManager.create("websocket-connection"),
    })).toThrow(/belong to this manager/i);
    await scope.dispose();
    expect(() => scope.resolve(VALUE)).toThrow(/while it is disposed/i);
    expect(() => scope.value(createToken("test.bun.after-dispose"), true)).toThrow(
      /while it is disposed/i,
    );
    expect(() => scope.scoped(createToken("test.bun.scoped-after-dispose"), () => ({}))).toThrow(
      /while it is disposed/i,
    );

    await manager.dispose();
    expect(() => manager.create("queue-job")).toThrow(/manager is disposed/i);
    await foreignManager.dispose();
  });

  it("rejects children while a parent scope is closing", async () => {
    const RESOURCE = createToken<object>("test.bun.closing-parent");
    const cleanupGate = deferred();
    const manager = new BunExecutionScopeManager(new Container());
    const connection = manager
      .create("websocket-connection")
      .value(RESOURCE, {}, { dispose: () => cleanupGate.promise });

    const disposal = connection.dispose();
    expect(connection.state).toBe("closing");
    expect(() => manager.create("websocket-message", { parent: connection })).toThrow(
      /while it is closing/i,
    );
    cleanupGate.resolve();
    await disposal;
    await manager.dispose();
  });

  it.each(["http-request", "queue-job"] satisfies BunChildExecutionScopeKind[])(
    "isolates concurrent %s contextual state",
    async (kind) => {
      const CURRENT = createToken<string>(`test.bun.concurrent.${kind}`);
      const SERVICE = createToken<{ readonly current: string }>(`test.bun.service.${kind}`);
      const manager = new BunExecutionScopeManager(new Container());
      const firstGate = deferred();
      const secondGate = deferred();

      const first = manager.run(kind, async (scope) => {
        scope.value(CURRENT, "first").scoped(SERVICE, (current) => ({
          current: current.resolve(CURRENT),
        }));
        await firstGate.promise;
        return scope.resolve(SERVICE);
      });
      const second = manager.run(kind, async (scope) => {
        scope.value(CURRENT, "second").scoped(SERVICE, (current) => ({
          current: current.resolve(CURRENT),
        }));
        await secondGate.promise;
        return scope.resolve(SERVICE);
      });

      secondGate.resolve();
      firstGate.resolve();
      await expect(first).resolves.toEqual({ current: "first" });
      await expect(second).resolves.toEqual({ current: "second" });
      expect(manager.activeScopeCount).toBe(0);
      await manager.dispose();
    },
  );

  it("integrates active and manual scope cleanup into Core-owned shutdown", async () => {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const ACTIVE = createToken<object>("test.bun.active-shutdown");
    const MANUAL = createToken<object>("test.bun.manual-shutdown");
    const activeGate = deferred();
    const activeStarted = deferred();
    const disposed: string[] = [];
    const app = defineApp()
      .withAdapter(new BunAdapter({ role: "worker" }))
      .withRuntimeRegistry(defineRuntimeRegistry());
    await app.start();
    const manager = app.rootContainer.get(BUN_EXECUTION_SCOPE_MANAGER);
    const manual = manager
      .create("queue-job")
      .value(MANUAL, {}, { dispose: () => { disposed.push("manual"); } });
    const active = manager.run("http-request", async (scope) => {
      scope.value(ACTIVE, {}, { dispose: () => { disposed.push("active"); } });
      activeStarted.resolve();
      await activeGate.promise;
    });
    await activeStarted.promise;

    const stop = app.stop();
    await vi.waitFor(() => expect(manager.state).toBe("closing"));
    expect(app.state).toBe("stopping");
    expect(() => manager.create("command")).toThrow(/manager is closing/i);
    expect(manual.state).toBe("active");
    expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);

    activeGate.resolve();
    await active;
    await stop;

    expect(disposed).toEqual(["active", "manual"]);
    expect(manual.state).toBe("disposed");
    expect(manager.applicationScope.state).toBe("disposed");
    expect(manager.state).toBe("disposed");
    expect(app.state).toBe("stopped");
    expect(process.listenerCount("SIGINT")).toBe(beforeInt);
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
  });

  it("propagates scope cleanup failure through Application.stop() and removes signals", async () => {
    const beforeInt = process.listenerCount("SIGINT");
    const beforeTerm = process.listenerCount("SIGTERM");
    const RESOURCE = createToken<object>("test.bun.stop-failure");
    const cleanupError = new Error("scope cleanup failed");
    const app = defineApp()
      .withAdapter(new BunAdapter({ role: "worker" }))
      .withRuntimeRegistry(defineRuntimeRegistry());
    await app.start();
    app.rootContainer
      .get(BUN_EXECUTION_SCOPE_MANAGER)
      .create("scheduled-task")
      .value(RESOURCE, {}, { dispose: () => { throw cleanupError; } });

    await expect(app.stop()).rejects.toBe(cleanupError);
    expect(app.state).toBe("failed");
    expect(process.listenerCount("SIGINT")).toBe(beforeInt);
    expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
  });
});
