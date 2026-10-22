import {
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_HTTP_CONTEXT_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BUN_PAGE_REQUEST_HEADER,
  BUN_REQUEST_KIND,
  BunAdapter,
  FormRequest,
  Get,
  Post,
  Request as RequestDecorator,
  SignedUrlMiddleware,
  SignedUrlManager,
  type BunHttpContext,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  MIDDLEWARE_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineMiddlewareAttachment,
  defineRuntimeRegistry,
} from "@bunwire/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secret = "0123456789abcdef0123456789abcdef";
let calls = 0;

@RequestDecorator()
class UploadRequest extends FormRequest {
  override rules() { return { upload: "file|maxFileBytes:3|mime:text/plain" }; }
  override authorize() { return this.get("allow") !== "no"; }
}

@Controller("/m18")
class ConvenienceController {
  @Get("/download")
  download(): Response { calls++; return new Response("downloaded"); }

  @Get("/items")
  async items(context: BunHttpContext): Promise<object> {
    calls++;
    return { ...context.pagination.result(["item"], 3),
      signedLink: await context.signedUrls!.sign("/m18/download") };
  }

  @Post("/upload")
  upload(_request: UploadRequest): object { calls++; return { ok: true }; }
}

const registry = defineRuntimeRegistry({
  classes: [
    { kind: CONTROLLER_KIND, target: ConvenienceController, data: { prefix: "/m18" } },
    { kind: BUN_REQUEST_KIND, target: UploadRequest, data: { type: "request" } },
    { kind: MIDDLEWARE_KIND, target: SignedUrlMiddleware, data: Object.freeze({ scope: "transient", alias: "signed" }), scope: "transient" },
  ],
  methods: [
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: ConvenienceController,
      method: "download", data: { method: "GET", path: "/download" }, parameters: [],
      middleware: [defineMiddlewareAttachment(SignedUrlMiddleware)],
    }),
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: ConvenienceController,
      method: "items", data: { method: "GET", path: "/items" },
      parameters: [{ source: "resolver", methodIndex: 0, resolverId: BUN_HTTP_CONTEXT_RESOLVER_ID }],
    }),
    defineManagedMethodPlan({
      kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: ConvenienceController,
      method: "upload", data: { method: "POST", path: "/upload" },
      parameters: [{ source: "resolver", methodIndex: 0, resolverId: BUN_FORM_REQUEST_RESOLVER_ID, token: UploadRequest }],
    }),
  ],
});

type Handler = (request: Request, server: object) => Promise<Response>;
interface FakeServeOptions { readonly routes: Record<string, Record<string, Handler>> }
let previousBun: PropertyDescriptor | undefined;
let options: FakeServeOptions;
const server = { stop: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  calls = 0;
  previousBun = Object.getOwnPropertyDescriptor(globalThis, "Bun");
  Object.defineProperty(globalThis, "Bun", { configurable: true, value: {
    serve(received: FakeServeOptions) { options = received; return server; },
  } });
});

afterEach(() => {
  if (previousBun) Object.defineProperty(globalThis, "Bun", previousBun);
  else Reflect.deleteProperty(globalThis, "Bun");
});

async function start(pages = false) {
  const app = defineApp().withAdapter(new BunAdapter({
    handleSignals: false,
    http: {
      signedUrls: { secret },
      pagination: { defaultPageSize: 2, maxPageSize: 3 },
      ...(pages ? {
        sessions: { secret, cookie: { secure: false } },
        pages: { manifest: { protocol: 1 as const, mode: "development" as const,
          components: ["Upload"], entry: "http://localhost:5173/client.ts" } },
      } : {}),
    },
  })).withRuntimeRegistry(registry);
  await app.start();
  return app;
}

function route(path: string, method: "GET" | "POST"): Handler {
  const handler = options.routes[path]?.[method];
  expect(handler).toBeTypeOf("function");
  return handler!;
}

describe("Bun Milestone 18 — HTTP integration", () => {
  it("authorizes a signed generated route and rejects changes through HTTP 403", async () => {
    const app = await start();
    try {
      const handler = route("/m18/download", "GET");
      const signer = await SignedUrlManager.create({ secret });
      const link = await signer.sign("/m18/download?tag=a&tag=b", { expiresInSeconds: 60 });
      const invoke = (path: string) => handler(new Request(`http://host-controlled.test${path}`), server);
      expect((await invoke(link)).status).toBe(200);
      expect((await invoke(link.replace("tag=a", "tag=c"))).status).toBe(403);
      expect((await invoke("/m18/download?tag=a&tag=b")).status).toBe(403);
      expect(calls).toBe(1);
    } finally { await app.stop(); }
  });

  it("paginates through the generated HTTP route", async () => {
    const app = await start();
    try {
      const response = await route("/m18/items", "GET")(
        new Request("http://untrusted.test/m18/items?tag=a&tag=b&page=2&perPage=2"), server);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ page: 2, pageSize: 2, offset: 2,
        links: { self: "/m18/items?tag=a&tag=b&page=2&perPage=2", previous: "/m18/items?tag=a&tag=b&page=1&perPage=2" },
        signedLink: expect.stringMatching(/^\/m18\/download\?bw_signature=/) });
      const invalid = await route("/m18/items", "GET")(
        new Request("http://untrusted.test/m18/items?perPage=4"), server);
      expect(invalid.status).toBe(400);
      expect(calls).toBe(2);
    } finally { await app.stop(); }
  });

  it("keeps file errors on JSON 422 and page redirect paths and authorizes first", async () => {
    const app = await start(true);
    try {
      const handler = route("/m18/upload", "POST");
      const send = (form: FormData, headers?: HeadersInit) => handler(new Request("http://local/m18/upload", {
        method: "POST", body: form, ...(headers === undefined ? {} : { headers }),
      }), server);
      const missing = await send(new FormData());
      expect(missing.status).toBe(422);
      expect(await missing.json()).toMatchObject({ errors: { upload: [expect.any(String)] } });
      const large = new FormData();
      large.append("upload", new File(["four"], "allowed.txt", { type: "text/plain" }));
      expect((await send(large)).status).toBe(422);
      const wrongType = new FormData();
      wrongType.append("upload", new File(["ok"], "allowed.txt", { type: "application/json" }));
      expect((await send(wrongType)).status).toBe(422);
      const denied = new FormData();
      denied.append("allow", "no");
      expect((await send(denied)).status).toBe(403);
      const page = await send(large, { [BUN_PAGE_REQUEST_HEADER]: "true", Referer: "http://local/form" });
      expect(page.status).toBe(303);
      expect(page.headers.get("location")).toBe("/form");
      const valid = new FormData();
      valid.append("upload", new File(["ok"], "wrong-extension.jpg", { type: "text/plain" }));
      expect((await send(valid)).status).toBe(200);
      expect(calls).toBe(1);
    } finally { await app.stop(); }
  });
});
