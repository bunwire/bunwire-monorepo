import {
  APPLICATION_CONTEXT,
  Controller,
  Inject,
  Middleware,
  Provider,
  Service,
  Use,
  createToken,
  type Container,
} from "@bunwire/core";
import {
  Context,
  Message,
  Route,
  Window,
  type ElectrobunContext,
  type ElectrobunMiddlewareContext,
  type ElectrobunWindow,
} from "@bunwire/electrobun";

export interface Cache {
  get(key: string): string | undefined;
}

export interface User {
  readonly id: string;
  readonly includePosts: boolean;
  readonly windowTitle: string;
}

export const CACHE = createToken<Cache>("example.cache");

@Service()
export class DatabaseService {
  findUser(id: string): { readonly id: string } {
    return { id };
  }
}

@Service
export class UserService {
  constructor(private readonly database: DatabaseService) {}

  find(id: string): { readonly id: string } {
    return this.database.findUser(id);
  }
}

@Middleware()
export class RequestLoggingMiddleware implements Middleware<ElectrobunMiddlewareContext> {
  protected alias = "request-logger";
  protected only = ["request"];

  constructor(private readonly users: UserService) {}

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    void this.users;
    console.info(`Calling Electrobun endpoint ${context.endpoint}.`);
    return next();
  }
}

@Provider()
export class CacheProvider {
  register(container: Container): void {
    const context = container.get(APPLICATION_CONTEXT) as ElectrobunContext;
    container.value(CACHE, {
      get: (key: string) => `${context.window.title}:${key}`,
    });
  }
}

@Controller("users")
export class UserController {
  constructor(private readonly users: UserService) {}

  @Route("get")
  @Use(RequestLoggingMiddleware)
  async get(
    id: string,
    methodUsers: UserService,
    @Inject(CACHE) cache: Cache,
    @Window window: ElectrobunWindow,
    includePosts?: boolean,
  ): Promise<User> {
    const user = methodUsers.find(this.users.find(id).id);
    void cache.get(id);
    return { id: user.id, includePosts: includePosts ?? false, windowTitle: window.title };
  }

  @Message("deleted")
  deleted(id: string, @Context() context: ElectrobunContext): void {
    console.info(`Deleted ${id} in window ${context.window.id}.`);
  }
}
