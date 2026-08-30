import { Controller, Service } from "@bunwire/core";
import {
  Context,
  Delete,
  Get,
  Head,
  Options,
  Patch,
  Post,
  Put,
  type BunHttpContext,
} from "@bunwire/bun";

@Service()
export class RouteService {}

@Controller("/api/")
export class RouteController {
  constructor(readonly service: RouteService) {}

  @Get()
  get(@Context() _context: BunHttpContext): Response { return new Response(); }

  @Post("users/:id/")
  post(): Response { return new Response(); }

  @Put("/users/:id")
  put(): Response { return new Response(); }

  @Patch("users/:id")
  patch(): Response { return new Response(); }

  @Delete("users/:id")
  delete(): Response { return new Response(); }

  @Options("users/:id")
  options(): Response { return new Response(); }

  @Head("files/*")
  head(): Response { return new Response(); }
}
