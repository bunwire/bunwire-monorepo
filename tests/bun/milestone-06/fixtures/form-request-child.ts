import {
  BUN_FORM_REQUEST_RESOLVER_ID,
  BUN_HTTP_ROUTE_KIND,
  BUN_REQUEST_KIND,
  BunAdapter,
  FormRequest,
  Post,
  Request,
  type BunHttpServer,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";
import type { RuleDefinitions } from "@bunwire/validation";

interface ProcessInput extends Record<string, unknown> {
  id?: string;
  name?: string;
  upload?: File;
}

@Request()
class ProcessRequest extends FormRequest<ProcessInput, Pick<ProcessInput, "id" | "name" | "upload">> {
  override rules(): RuleDefinitions<ProcessInput> {
    return {
      id: "required|string",
      name: ["required", async ({ value }) => {
        await Promise.resolve();
        return value === "valid" ? { valid: true } : { valid: false };
      }],
      upload: "optional",
    };
  }
}

@Controller("/requests")
class ProcessController {
  @Post("/:id")
  create(request: ProcessRequest): object {
    const upload = request.sources.files.upload;
    return {
      id: request.validated().id,
      name: request.validated().name,
      file: upload instanceof File ? upload.name : null,
      scopeId: request.context.scope.id,
    };
  }
}

const plan = defineManagedMethodPlan({
  kind: BUN_HTTP_ROUTE_KIND,
  ownerKind: CONTROLLER_KIND,
  target: ProcessController,
  method: "create",
  data: { method: "POST", path: "/:id" },
  parameters: [{
    source: "resolver",
    methodIndex: 0,
    resolverId: BUN_FORM_REQUEST_RESOLVER_ID,
    token: ProcessRequest,
  }],
});

const registry = defineRuntimeRegistry({
  classes: [
    { kind: BUN_REQUEST_KIND, target: ProcessRequest, data: { type: "request" } },
    { kind: CONTROLLER_KIND, target: ProcessController, data: { prefix: "/requests" } },
  ],
  methods: [plan],
});

let server!: BunHttpServer;
const app = defineApp()
  .withAdapter(new BunAdapter({
    handleSignals: false,
    http: {
      hostname: "127.0.0.1",
      port: 0,
      onServer(value) { server = value; },
    },
  }))
  .withRuntimeRegistry(registry);

await app.start();
console.log(`BUNWIRE_FORM_REQUEST_READY ${server.url}`);

for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_FORM_REQUEST_STOPPED");
