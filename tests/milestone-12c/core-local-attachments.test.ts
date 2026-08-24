import { describe, expect, it } from "vitest";
import {
  Controller,
  Middleware,
  MiddlewareAttachmentError,
  Use,
  defineApp,
  defineManagedMethodPlan,
  defineMethodKind,
  defineMiddlewareAttachment,
  getManagedMethodMiddlewareMetadata,
  getUseMiddlewareMetadata,
  CONTROLLER_KIND,
  type ManagedMethodMiddleware,
} from "@bunwire/core";

const LOCAL_METHOD_KIND = defineMethodKind({
  id: "test.local-attachment",
  allowedOn: [CONTROLLER_KIND],
  invocable: true,
});

@Middleware()
class LocalMiddleware {
  handle(_context: unknown, next: () => Promise<unknown>) { return next(); }
}

describe("Middleware Redesign 12C — Core local attachment contracts", () => {
  it("records Controller and method managed references in top-to-bottom source order", () => {
    const callback: ManagedMethodMiddleware = (_invocation, next) => next();

    @Use("auth")
    @Use(LocalMiddleware)
    @Controller()
    class Target {
      @Use(LocalMiddleware)
      @Use(callback)
      run() {}
    }

    expect(getUseMiddlewareMetadata(Target)).toEqual(["auth", LocalMiddleware]);
    expect(getUseMiddlewareMetadata(Target.prototype, "run")).toEqual([
      LocalMiddleware,
      callback,
    ]);
    expect(getManagedMethodMiddlewareMetadata(Target.prototype, "run")).toEqual([callback]);
  });

  it("accepts immutable canonical attachments in plans and rejects malformed records", () => {
    @Controller()
    class Target { run() { return "ok"; } }

    const attachment = defineMiddlewareAttachment(LocalMiddleware, ["admin"]);
    const plan = defineManagedMethodPlan({
      kind: LOCAL_METHOD_KIND,
      ownerKind: CONTROLLER_KIND,
      target: Target,
      method: "run",
      data: undefined,
      parameters: [],
      middleware: [attachment],
    });
    expect(plan.middleware).toEqual([attachment]);
    expect(Object.isFrozen(plan.middleware)).toBe(true);
    expect(Object.isFrozen(attachment.parameters)).toBe(true);

    expect(() => defineManagedMethodPlan({
      kind: LOCAL_METHOD_KIND,
      ownerKind: CONTROLLER_KIND,
      target: Target,
      method: "run",
      data: undefined,
      parameters: [],
      middleware: [Object.freeze({
        target: LocalMiddleware,
        parameters: ["mutable"],
      })],
    })).toThrow(MiddlewareAttachmentError);
  });

  it("keeps legacy callbacks executable while managed attachments remain inert", async () => {
    const events: string[] = [];
    const callback: ManagedMethodMiddleware = async (_invocation, next) => {
      events.push("callback:before");
      const result = await next();
      events.push("callback:after");
      return `wrapped:${String(result)}`;
    };

    @Controller()
    class Target {
      run() { events.push("method"); return "ok"; }
    }

    const plan = defineManagedMethodPlan({
      kind: LOCAL_METHOD_KIND,
      ownerKind: CONTROLLER_KIND,
      target: Target,
      method: "run",
      data: undefined,
      parameters: [],
      middleware: [defineMiddlewareAttachment(LocalMiddleware), callback],
    });
    const app = defineApp()
      .withManagedMethodKind(LOCAL_METHOD_KIND)
      .withConventionBindings((container) => { container.transient(Target); });
    await app.start();

    await expect(app.invokeManagedMethod(plan)).resolves.toBe("wrapped:ok");
    expect(events).toEqual(["callback:before", "method", "callback:after"]);
  });
});
