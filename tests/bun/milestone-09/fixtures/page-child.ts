import {
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BUN_REQUEST_KIND,
  BunAdapter,
  Get,
  FormRequest,
  Post,
  Request,
  defer,
  page,
  type BunHttpServer,
  type BunExecutionScope,
} from "@bunwire/bun";
import { CONTROLLER_KIND, Controller, defineApp, defineManagedMethodPlan, defineRuntimeRegistry } from "@bunwire/core";
import pageManifest from "../../../../examples/bun-app/dist/client/bunwire-pages.json" with { type: "json" };
import { applicationRegistry } from "../../../../examples/bun-app/.bunwire/registry.js";

const pageMethods = applicationRegistry.methods.filter(({ method }) => method === "pageHome" || method === "pageDashboard");
const pageTargets = new Set(pageMethods.map(({ target }) => target));
let lastDeferredScope: BunExecutionScope | undefined;
for (const method of pageMethods) for (const attachment of method.middleware) pageTargets.add(attachment.target);

@Request()
class PageFormRequest extends FormRequest {
  rules() { return { name: "required|string|min:3" }; }
  protected override flashInput(): readonly string[] { return ["name"]; }
}

@Controller("/api/page-form")
class PageFormController {
  @Post()
  submit(_request: PageFormRequest): object { return { ok: true }; }
}

@Controller("/api/advanced")
class PageAdvancedController {
  @Get()
  show() {
    return page("Dashboard", {
      title: "Advanced",
      delayed: defer(async (context) => {
        lastDeferredScope = context.scope;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return context.request.headers.get("X-Viewer") ?? "anonymous";
      }),
    });
  }

  @Get("/scope")
  scope() { return { state: lastDeferredScope?.state ?? "none" }; }
}

const formPlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: PageFormController,
  method: "submit", data: { method: "POST", path: "/" },
  parameters: [{ source: "resolver", methodIndex: 0, resolverId: BUN_FORM_REQUEST_RESOLVER_ID, data: undefined, token: PageFormRequest }],
});
const advancedPlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: PageAdvancedController,
  method: "show", data: { method: "GET", path: "/" }, parameters: [],
});
const advancedScopePlan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND, ownerKind: CONTROLLER_KIND, target: PageAdvancedController,
  method: "scope", data: { method: "GET", path: "/scope" }, parameters: [],
});
const registry = defineRuntimeRegistry({
  classes: [
    ...applicationRegistry.classes.filter((entry) => pageTargets.has(entry.target)),
    { kind: BUN_REQUEST_KIND, target: PageFormRequest, data: { type: "request" } },
    { kind: CONTROLLER_KIND, target: PageFormController, data: { prefix: "/api/page-form" } },
    { kind: CONTROLLER_KIND, target: PageAdvancedController, data: { prefix: "/api/advanced" } },
  ],
  providers: [], methods: [...pageMethods, formPlan, advancedPlan, advancedScopePlan], events: [], eventAliases: [],
});

let server!: BunHttpServer;
const app = defineApp().withAdapter(new BunAdapter({
  handleSignals: false,
  http: {
    hostname: "127.0.0.1", port: 0,
    sessions: { secret: "0123456789abcdef0123456789abcdef", cookie: { secure: false } },
    pages: { manifest: pageManifest, shared: ({ http }) => ({ viewer: http.request.headers.get("X-Viewer") ?? "anonymous" }) },
    onServer(value) { server = value; },
  },
})).withRuntimeRegistry(registry);

await app.start();
console.log(`BUNWIRE_PAGES_READY ${server.url}`);
for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_PAGES_STOPPED");
