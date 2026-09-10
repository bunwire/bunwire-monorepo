import {
  Context,
  BUN_QUEUE_MANAGER,
  type QueueManager,
  Get,
  Post,
  redirect,
  page,
  type BunHttpContext,
  type BunRedirectResult,
} from "@bunwire/bun";
import { Controller, EventDispatcher, Inject, Use } from "@bunwire/core";
import { ExampleJobAudit, RecordExampleJob } from "./jobs.js";
import { EchoRequest } from "./echo-request.js";
import { ExampleActionRecorded, ExampleEventAudit } from "./events.js";
import type { ExamplePrincipal } from "./auth.js";

@Controller("/api")
export class HomeController {
  @Post("/jobs/:id")
  async recordJob(@Context() context: BunHttpContext, @Inject(BUN_QUEUE_MANAGER) queues: QueueManager, audit: ExampleJobAudit): Promise<object> {
    const id = context.route.params.id!;
    const receipt = await queues.job(RecordExampleJob, id).onQueue("audit").dispatch();
    return { receipt, deliveries: audit.records.filter((record) => record === id).length };
  }

  @Post("/events/:id")
  async recordEvent(
    @Context() context: BunHttpContext,
    events: EventDispatcher,
    audit: ExampleEventAudit,
  ): Promise<object> {
    const id = context.route.params.id!;
    await events.dispatch(new ExampleActionRecorded(id));
    return { id, deliveries: audit.records.filter((record) => record === id).length };
  }

  @Get()
  index(@Context() context: BunHttpContext): object {
    return {
      method: context.route.method,
      name: "bunwire",
    };
  }

  @Post("/echo/:id")
  echo(request: EchoRequest): object {
    return {
      ...request.validated(),
      scopeId: request.context.scope.id,
    };
  }

  @Use("example-guard:deny")
  @Get("/blocked")
  blocked(): Response {
    return new Response("unreachable");
  }

  @Get("/home")
  home(): BunRedirectResult {
    return redirect("/api", 302);
  }

  @Get("/page")
  pageHome() {
    return page("Home", { title: "Bunwire Pages" });
  }

  @Get("/page/dashboard")
  pageDashboard(@Context() context: BunHttpContext) {
    const visits = (context.session?.get<number>("page_visits") ?? 0) + 1;
    context.session?.put("page_visits", visits);
    return page("Dashboard", { title: "Dashboard", visits });
  }

  @Get("/session")
  async session(@Context() context: BunHttpContext): Promise<object> {
    return {
      count: context.session?.get("count") ?? 0,
      notice: context.session?.get("notice") ?? null,
      csrfToken: context.csrf ? await context.csrf.token() : null,
    };
  }

  @Use("csrf")
  @Post("/session")
  updateSession(@Context() context: BunHttpContext): object {
    const count = (context.session?.get<number>("count") ?? 0) + 1;
    context.session?.put("count", count).flash("notice", "Session updated");
    return { count };
  }

  @Get("/login")
  async login(@Context() context: BunHttpContext<ExamplePrincipal>): Promise<object> {
    await context.auth!.login({ id: "example-user", role: "admin" });
    return { authenticated: context.auth!.check() };
  }

  @Use("auth")
  @Get("/account")
  account(@Context() context: BunHttpContext<ExamplePrincipal>): object {
    return { principal: context.auth!.principal };
  }

  @Use("auth", "can:dashboard.view")
  @Get("/dashboard")
  dashboard(): object {
    return { allowed: true };
  }

  @Use("auth", "can:view,post")
  @Get("/posts/:post")
  post(@Context() context: BunHttpContext<ExamplePrincipal>): object {
    return { id: context.route.params.post };
  }

  @Use("auth")
  @Get("/logout")
  async logout(@Context() context: BunHttpContext<ExamplePrincipal>): Promise<object> {
    await context.auth!.logout();
    return { guest: context.auth!.guest() };
  }
}
