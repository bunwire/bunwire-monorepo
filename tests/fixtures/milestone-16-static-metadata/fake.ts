import { Controller, Event, Middleware, Service, Use, Inject, createToken } from "@bunwire/core";
import { Framework, Handle, Tag } from "proof-static";
import { ATTACHMENT_OPTIONS, EVENT_ALIAS, INJECTOR_OPTIONS, METHOD_OPTIONS, MIDDLEWARE_ALIAS, USE_AUDIT } from "./options.js";
export const CACHE = createToken<string>("static.cache");
@Service() export class Users { name = "users"; }
@Event() export class Created { protected alias = EVENT_ALIAS; }
@Middleware() export class Audit {
  protected alias = MIDDLEWARE_ALIAS;
  protected include = ["/**", ...["/static/**"]];
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
@Controller("static") @Tag(ATTACHMENT_OPTIONS) @Use(USE_AUDIT)
export class Actions {
  @Handle(METHOD_OPTIONS)
  run(id: string, users: Users, suffix: string, @Inject(CACHE) cache: string, @Framework(INJECTOR_OPTIONS) framework: string) {
    return { id, user: users.name, suffix, cache, framework };
  }
}
