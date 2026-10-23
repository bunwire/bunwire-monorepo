import { Context, FormRequest, Get, Post, Request, defer, page, type BunHttpContext } from "@bunwire/bun";
import { Controller, Use } from "@bunwire/core";
import type { ExamplePrincipal } from "./auth.js";

@Request()
export class ExampleUploadRequest extends FormRequest<{ upload?: File }, { upload: File }> {
  override rules() { return { upload: "required|file|maxFileBytes:1024|mime:image/png" }; }
}

@Controller("/api/v2")
export class V2Controller {
  @Use("auth")
  @Get("/report-link/:id")
  async reportLink(@Context() context: BunHttpContext): Promise<object> {
    return { href: await context.signedUrls!.sign(`/api/v2/report/${context.route.params.id}`) };
  }

  @Use("auth", "signed", "throttle:v2-report")
  @Get("/report/:id")
  report(@Context() context: BunHttpContext): object {
    return { id: context.route.params.id, signed: true };
  }

  @Get("/reports")
  reports(@Context() context: BunHttpContext): object {
    const all = ["first", "second", "third", "fourth", "fifth"];
    const { offset, pageSize } = context.pagination.input();
    return context.pagination.result(all.slice(offset, offset + pageSize), all.length);
  }

  @Use("auth")
  @Get("/upload-page")
  uploadPage() { return page("Dashboard", { title: "Upload example" }); }

  @Use("auth", "csrf")
  @Post("/upload")
  upload(request: ExampleUploadRequest): object {
    const file = request.validated().upload;
    return { name: file.name, size: file.size };
  }

  @Use("auth")
  @Get("/private-page")
  async privatePage(@Context() context: BunHttpContext<ExamplePrincipal>) {
    const canView = await context.authorization!.allows("dashboard.view");
    await context.authorization!.authorize("dashboard.view");
    return page("Dashboard", {
      title: "Private dashboard",
      canView,
      role: context.auth!.principal!.role,
      details: defer(async () => ({ owner: context.auth!.principal!.id })),
    });
  }
}
