import {
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BUN_REQUEST_KIND,
  BunAdapter,
  FormRequest,
  Post,
  Request as RequestDecorator,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  MIDDLEWARE_KIND,
  Middleware,
  SERVICE_KIND,
  Service,
  defineApp,
  defineManagedMethodPlan,
  defineMiddlewareAttachment,
  defineRuntimeRegistry,
} from "@bunwire/core";
import type { Rule, RuleDefinitions } from "@bunwire/validation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CreateInput extends Record<string, unknown> {
  id?: string;
  name?: string;
  normalized?: string;
  tags?: string | readonly string[];
  allow?: string;
  upload?: File;
}

const asyncAccepted: Rule<CreateInput> = {
  name: "accepted-async",
  defaultMessage: "The :attribute field was not asynchronously accepted.",
  caller: async ({ value }) => {
    await Promise.resolve();
    return value === "valid" ? { valid: true } : { valid: false };
  },
};

const uploadedFile: Rule<CreateInput> = {
  name: "uploaded-file",
  caller: ({ value }) => typeof File !== "undefined" && value instanceof File
    ? { valid: true }
    : { valid: false, message: "The :attribute field must be a file." },
};

@Service()
class RequestDependency {
  readonly value = "from-di";
}

@RequestDecorator()
class CreateRequest extends FormRequest<CreateInput, Pick<CreateInput, "id" | "name" | "normalized" | "tags" | "upload">> {
  constructor(readonly dependency: RequestDependency) { super(); }

  override rules(): RuleDefinitions<CreateInput> {
    return {
      id: "required|string",
      name: ["required", "string", asyncAccepted],
      normalized: "required|string",
      tags: "optional",
      upload: ["optional", uploadedFile],
    };
  }

  override messages() { return { "name.required": "Please provide :attribute." }; }
  override attributes() { return { name: "display name" }; }
  override authorize(): boolean { return this.get("allow") !== "no"; }

  protected override prepareForValidation(): void {
    this.merge({ normalized: this.dependency.value });
  }
}

class UndecoratedRequest extends FormRequest {
  override rules() { return {}; }
}

@RequestDecorator()
class UnregisteredRequest extends FormRequest {
  override rules() { return {}; }
}

let controllerCalls = 0;

@Controller("/requests")
class RequestController {
  @Post("/:id")
  async create(first: CreateRequest, second: CreateRequest): Promise<object> {
    controllerCalls += 1;
    const upload = first.sources.files.upload;
    const all = first.all();
    const validated = first.validated();
    const mediaType = first.context.request.headers.get("content-type") ?? "";
    const nativeBody = mediaType.includes("json")
      ? await first.context.request.json() as Record<string, unknown>
      : undefined;
    return {
      all: { ...all, upload: upload instanceof File ? upload.name : null },
      validated: { ...validated, upload: upload instanceof File ? upload.name : null },
      route: first.sources.route,
      query: first.sources.query,
      bodyId: first.sources.body.id ?? null,
      hasFile: upload instanceof File,
      fileName: upload instanceof File ? upload.name : null,
      same: first === second,
      scopeId: first.context.scope.id,
      nativeName: nativeBody?.name ?? null,
      frozen: Object.isFrozen(first.sources)
        && Object.isFrozen(first.sources.route)
        && Object.isFrozen(first.sources.query)
        && Object.isFrozen(first.sources.body)
        && Object.isFrozen(first.sources.files),
    };
  }

  @Post("/short/:id")
  short(_request: CreateRequest): object {
    controllerCalls += 1;
    return { unreachable: true };
  }
}

@Middleware()
class ShortCircuitMiddleware {
  handle(): Response { return Response.json({ short: true }); }
}

const requestPlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: RequestController,
  method: "create",
  data: { method: "POST", path: "/:id" },
  parameters: [0, 1].map((methodIndex) => ({
    source: "resolver" as const,
    methodIndex,
    resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
    token: CreateRequest,
  })),
});

const shortCircuitPlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: RequestController,
  method: "short",
  data: { method: "POST", path: "/short/:id" },
  parameters: [{
    source: "resolver",
    methodIndex: 0,
    resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
    token: CreateRequest,
  }],
  middleware: [defineMiddlewareAttachment(ShortCircuitMiddleware)],
});

function registry() {
  return defineRuntimeRegistry({
    classes: [
      { kind: SERVICE_KIND, target: RequestDependency, data: { scope: "singleton" } },
      {
        kind: BUN_REQUEST_KIND,
        target: CreateRequest,
        data: { type: "request" },
        dependencies: [{ index: 0, token: RequestDependency }],
      },
      { kind: CONTROLLER_KIND, target: RequestController, data: { prefix: "/requests" } },
      {
        kind: MIDDLEWARE_KIND,
        target: ShortCircuitMiddleware,
        data: Object.freeze({ scope: "transient" as const }),
        scope: "transient",
      },
    ],
    methods: [requestPlan, shortCircuitPlan],
  });
}

interface FakeServeOptions {
  readonly routes: Record<string, Record<string, (request: globalThis.Request, server: object) => Promise<Response>>>;
}

let previousBun: PropertyDescriptor | undefined;
let options: FakeServeOptions;
const server = { stop: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  controllerCalls = 0;
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  server.stop.mockClear();
  Object.defineProperty(globalThis, "Bun", {
    configurable: true,
    value: { serve: (received: FakeServeOptions) => { options = received; return server; } },
  });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

function nativeRequest(
  body: BodyInit | undefined,
  contentType: string | undefined,
  id = "route-id",
  query = "id=query-id",
): globalThis.Request {
  const request = new globalThis.Request(`http://local/requests/${id}?${query}`, {
    method: "POST",
    ...(body === undefined ? {} : { body }),
    ...(contentType === undefined ? {} : { headers: { "Content-Type": contentType } }),
  });
  return Object.assign(request, { params: { id } });
}

async function start() {
  const app = defineApp()
    .withAdapter(new BunAdapter({ handleSignals: false }))
    .withRuntimeRegistry(registry());
  await app.start();
  const handler = options.routes["/requests/:id"]?.POST;
  expect(handler).toBeTypeOf("function");
  return { app, handler: handler as NonNullable<typeof handler> };
}

describe("Bun Milestone 6 — Form Request runtime", () => {
  it("rejects noncanonical registry entries and unregistered resolver identities", async () => {
    const noncanonical = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: [{ kind: BUN_REQUEST_KIND, target: UndecoratedRequest, data: { type: "request" } }],
      }));
    await expect(noncanonical.start()).rejects.toThrow(/own managed metadata.*bun\.request/i);

    const unregisteredPlan = defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND,
      ownerKind: CONTROLLER_KIND,
      target: RequestController,
      method: "create",
      data: { method: "POST", path: "/:id" },
      parameters: [
        { source: "resolver", methodIndex: 0, resolverId: BUN_FORM_REQUEST_RESOLVER_ID, token: UnregisteredRequest },
        { source: "resolver", methodIndex: 1, resolverId: BUN_FORM_REQUEST_RESOLVER_ID, token: UnregisteredRequest },
      ],
    });
    const unregistered = defineApp()
      .withAdapter(new BunAdapter({ handleSignals: false }))
      .withRuntimeRegistry(defineRuntimeRegistry({
        classes: [{ kind: CONTROLLER_KIND, target: RequestController, data: { prefix: "/requests" } }],
        methods: [unregisteredPlan],
      }));
    await expect(unregistered.start()).rejects.toThrow(/unregistered Bun Request identity/i);
  });

  it("aggregates JSON deterministically, prepares, validates async, injects DI, and reuses the instance", async () => {
    const { app, handler } = await start();
    const response = await handler(nativeRequest(
      JSON.stringify({ id: "body-id", name: "valid", tags: ["one", "two"] }),
      "application/json",
    ), server);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      all: { id: "route-id", name: "valid", normalized: "from-di", tags: ["one", "two"] },
      validated: { id: "route-id", name: "valid", normalized: "from-di", tags: ["one", "two"] },
      route: { id: "route-id" },
      query: { id: "query-id" },
      bodyId: "body-id",
      same: true,
      nativeName: "valid",
      frozen: true,
    });
    const structured = await handler(nativeRequest(
      JSON.stringify({ name: "valid" }),
      "application/problem+json",
      "structured",
      "tags=one&tags=two",
    ), server);
    expect(await structured.json()).toMatchObject({
      all: { id: "structured", tags: ["one", "two"], name: "valid" },
      nativeName: "valid",
    });
    expect(controllerCalls).toBe(2);
    await app.stop();
  });

  it("returns deterministic validation, authorization, and malformed-body failures without invoking the controller", async () => {
    const { app, handler } = await start();
    const invalid = await handler(nativeRequest(JSON.stringify({ name: "" }), "application/json"), server);
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      message: "Validation Failed",
      errors: { name: [
        "Please provide display name.",
        "The display name field was not asynchronously accepted.",
      ] },
    });
    const forbidden = await handler(nativeRequest(
      JSON.stringify({ allow: "no" }),
      "application/json",
    ), server);
    expect(forbidden.status).toBe(403);
    const malformed = await handler(nativeRequest("{", "application/json"), server);
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).toBe("Bad Request");
    const nonObject = await handler(nativeRequest("[]", "application/json"), server);
    expect(nonObject.status).toBe(400);
    expect(controllerCalls).toBe(0);
    await app.stop();
  });

  it("does not parse or resolve Form Requests when middleware short-circuits", async () => {
    const { app } = await start();
    const handler = options.routes["/requests/short/:id"]?.POST;
    expect(handler).toBeTypeOf("function");
    const malformed = Object.assign(new globalThis.Request("http://local/requests/short/id", {
      method: "POST",
      body: "{",
      headers: { "Content-Type": "application/json" },
    }), { params: { id: "id" } });
    const response = await handler!(malformed, server);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ short: true });
    expect(controllerCalls).toBe(0);
    await app.stop();
  });

  it("supports urlencoded repeats, multipart fields/files, and concurrent scope isolation", async () => {
    const { app, handler } = await start();
    const encoded = await handler(nativeRequest(
      "name=valid&tags=one&tags=two",
      "application/x-www-form-urlencoded",
    ), server);
    expect((await encoded.json() as { all: CreateInput }).all.tags).toEqual(["one", "two"]);

    const form = new FormData();
    form.append("name", "valid");
    form.append("upload", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const multipart = await handler(nativeRequest(form, undefined), server);
    expect(await multipart.json()).toMatchObject({ hasFile: true, fileName: "hello.txt" });

    const [first, second] = await Promise.all([
      handler(nativeRequest(JSON.stringify({ name: "valid" }), "application/json", "one"), server),
      handler(nativeRequest(JSON.stringify({ name: "valid" }), "application/json", "two"), server),
    ]);
    const firstBody = await first.json() as { scopeId: number; all: CreateInput };
    const secondBody = await second.json() as { scopeId: number; all: CreateInput };
    expect(firstBody.all.id).toBe("one");
    expect(secondBody.all.id).toBe("two");
    expect(firstBody.scopeId).not.toBe(secondBody.scopeId);
    await app.stop();
  });
});
