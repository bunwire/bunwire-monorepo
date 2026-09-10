import {
  BUN_HTTP_ROUTE_KIND,
  BunAdapter,
  BunHttpException,
  Get,
  redirect,
  type BunHttpServer,
} from "@bunwire/bun";
import {
  CONTROLLER_KIND,
  Controller,
  defineApp,
  defineManagedMethodPlan,
  defineRuntimeRegistry,
} from "@bunwire/core";

@Controller("/pipeline")
class PipelineController {
  @Get("/json")
  json(): object { return { ok: true, source: "pipeline" }; }

  @Get("/void")
  empty(): void {}

  @Get("/redirect")
  moved() { return redirect("/pipeline/json", 303); }

  @Get("/known")
  known(): never { throw new BunHttpException(418, "Teapot"); }

  @Get("/failure")
  failure(): never { throw new Error("process-private-error"); }
}

function plan(
  method: keyof PipelineController,
  path: string,
) {
  return defineManagedMethodPlan({
    kind: BUN_HTTP_ROUTE_KIND,
    ownerKind: CONTROLLER_KIND,
    target: PipelineController,
    method,
    data: { method: "GET", path },
    parameters: [],
  });
}

const registry = defineRuntimeRegistry({
  classes: [{
    kind: CONTROLLER_KIND,
    target: PipelineController,
    data: { prefix: "/pipeline" },
  }],
  methods: [
    plan("json", "/json"),
    plan("empty", "/void"),
    plan("moved", "/redirect"),
    plan("known", "/known"),
    plan("failure", "/failure"),
  ],
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
console.log(`BUNWIRE_PIPELINE_READY ${server.url}`);

for await (const chunk of Bun.stdin.stream()) {
  if (new TextDecoder().decode(chunk).includes("stop")) break;
}
await app.stop();
console.log("BUNWIRE_PIPELINE_STOPPED");
