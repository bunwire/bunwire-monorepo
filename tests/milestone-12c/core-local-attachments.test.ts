import { describe, expect, it } from "vitest";
import {
  Controller,
  Middleware,
  MiddlewareAttachmentError,
  Use,
  defineManagedMethodPlan,
  defineMethodKind,
  defineMiddlewareAttachment,
  getUseMiddlewareMetadata,
  CONTROLLER_KIND,
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
    @Use("auth")
    @Use(LocalMiddleware)
    @Controller()
    class Target {
      @Use(LocalMiddleware)
      @Use("auth:method")
      run() {}
    }

    expect(getUseMiddlewareMetadata(Target)).toEqual(["auth", LocalMiddleware]);
    expect(getUseMiddlewareMetadata(Target.prototype, "run")).toEqual([
      LocalMiddleware,
      "auth:method",
    ]);
  });

  it("preserves class and method metadata under standard decorators", () => {
    const metadata = {};
    class StandardTarget {
      run(): void {}
    }
    const methodContext = { kind: "method", name: "run", metadata };
    const classContext = { kind: "class", name: "StandardTarget", metadata };
    const applyStandard = (
      decorator: ClassDecorator | MethodDecorator,
      value: object,
      context: object,
    ) => (decorator as unknown as (target: object, standardContext: object) => unknown)(
      value,
      context,
    );

    // Standard decorators apply bottom-to-top. The stored result must retain
    // the same top-to-bottom source order as legacy TypeScript decorators.
    applyStandard(Use("auth:method"), StandardTarget.prototype.run, methodContext);
    applyStandard(Use(LocalMiddleware), StandardTarget.prototype.run, methodContext);
    applyStandard(Controller(), StandardTarget, classContext);
    applyStandard(Use(LocalMiddleware), StandardTarget, classContext);
    applyStandard(Use("auth"), StandardTarget, classContext);

    expect(getUseMiddlewareMetadata(StandardTarget)).toEqual(["auth", LocalMiddleware]);
    expect(getUseMiddlewareMetadata(StandardTarget.prototype, "run")).toEqual([
      LocalMiddleware,
      "auth:method",
    ]);
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

  it("rejects function callbacks at the decorator boundary", () => {
    expect(() => Use((() => undefined) as never)).toThrow(/canonical.*middleware/i);
  });
});
