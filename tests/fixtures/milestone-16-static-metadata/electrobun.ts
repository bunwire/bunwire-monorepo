import { Controller, Middleware, Service, Use } from "@bunwire/core";
import { Route, Window, type ElectrobunWindow } from "@bunwire/electrobun";
import { ELECTROBUN_FILTERS, MIDDLEWARE_ALIAS, TRANSPORT_ONLY, USE_AUDIT } from "./options.js";
const PREFIX = "static";
const ROUTE = "get";
@Service() export class Users { readonly name = "users"; }
@Middleware() export class Audit {
  protected alias = MIDDLEWARE_ALIAS;
  protected include = ELECTROBUN_FILTERS;
  protected only = TRANSPORT_ONLY;
  async handle(_context: unknown, next: () => Promise<unknown>): Promise<unknown> { return next(); }
}
@Controller(PREFIX) @Use(USE_AUDIT)
export class Requests {
  @Route(ROUTE)
  get(id: string, users: Users, @Window() window: ElectrobunWindow) { return `${id}:${users.name}:${window.title}`; }
}
