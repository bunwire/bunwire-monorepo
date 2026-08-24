import {
  APPLICATION_CONTEXT,
  Controller,
  Inject,
  Middleware,
  Provider,
  Service,
  Use as AttachMiddleware,
  createToken,
  type Container,
  type InvocationContext,
} from "@bunwire/core";
import {
  Context,
  ELECTROBUN_CONTEXT,
  Message,
  Route,
  Webview,
  Window,
  type ElectrobunContext,
  type ElectrobunMiddlewareContext,
  type ElectrobunWebview,
  type ElectrobunWindow,
} from "@bunwire/electrobun";

export interface Cache {
  get(key: string): string;
}

export interface UserResult {
  readonly id: string;
  readonly database: string;
  readonly constructorService: string;
  readonly methodService: string;
  readonly cached: string;
  readonly windowTitle: string;
  readonly webviewId: number;
  readonly contextMatches: boolean;
  readonly includePosts: boolean;
  readonly middlewareApplied?: boolean;
}

export interface DeleteResult {
  readonly ids: readonly string[];
  readonly notify: boolean;
  readonly labels: readonly string[];
}

export const CACHE = createToken<Cache>("milestone-12.cache");

export const lifecycle = {
  registerCount: 0,
  bootInvocationIds: [] as number[],
  registrationContext: undefined as ElectrobunContext | undefined,
  messages: [] as string[],
  middlewareEvents: [] as string[],
};

export function resetLifecycle(): void {
  lifecycle.registerCount = 0;
  lifecycle.bootInvocationIds.length = 0;
  lifecycle.registrationContext = undefined;
  lifecycle.messages.length = 0;
  lifecycle.middlewareEvents.length = 0;
}

@Service()
export class DatabaseService {
  source(id: string): string {
    return `database:${id}`;
  }
}

@Service()
export class UserService {
  constructor(readonly database: DatabaseService) {}

  describe(id: string): string {
    return `service:${id}`;
  }
}

@Middleware()
export class LoggingMiddleware implements Middleware<ElectrobunMiddlewareContext> {
  protected alias = "logging";
  protected only = ["request"];

  constructor(private readonly users: UserService) {}

  async handle(context: ElectrobunMiddlewareContext, next: () => Promise<unknown>): Promise<unknown> {
    void this.users;
    lifecycle.middlewareEvents.push(`before:${context.endpoint}`);
    const result = await next();
    lifecycle.middlewareEvents.push(`after:${context.endpoint}`);
    return typeof result === "object" && result !== null
      ? { ...result, middlewareApplied: true }
      : result;
  }
}

@Provider()
export class ApplicationProvider {
  register(container: Container): void {
    lifecycle.registerCount += 1;
    lifecycle.registrationContext = container.get(APPLICATION_CONTEXT) as ElectrobunContext;
    if (container.get(ELECTROBUN_CONTEXT) !== lifecycle.registrationContext) {
      throw new Error("Electrobun adapter bindings must exist before application Provider registration.");
    }
    container.value(CACHE, { get: (key: string) => `cache:${key}` });
  }

  boot(context: InvocationContext): void {
    lifecycle.bootInvocationIds.push(context.id);
  }
}

@Controller("users")
export class UserController {
  constructor(readonly users: UserService) {}

  @Route("get")
  @AttachMiddleware(LoggingMiddleware)
  async get(
    id: string,
    methodUsers: UserService,
    @Inject(CACHE) cache: Cache,
    @Window() window: ElectrobunWindow,
    @Webview() webview: ElectrobunWebview,
    @Context() context: ElectrobunContext,
    includePosts?: boolean,
  ): Promise<UserResult> {
    return {
      id,
      database: this.users.database.source(id),
      constructorService: this.users.describe(id),
      methodService: methodUsers.describe(id),
      cached: cache.get(id),
      windowTitle: window.title,
      webviewId: webview.id,
      contextMatches: context.window === window && context.webview === webview,
      includePosts: includePosts ?? false,
    };
  }

  @Route("deleteUsers")
  deleteUsers(ids: string[], notify: boolean, ...labels: string[]): DeleteResult {
    return { ids, notify, labels };
  }

  @Route("defaulted")
  defaulted(prefix = "default", required: string): string {
    return `${prefix}:${required}`;
  }

  @Message("deleted")
  deleted(id: string, @Context() context: ElectrobunContext): string {
    lifecycle.messages.push(`${id}:${context.window.title}`);
    return "private-message-result";
  }

  ordinary(): string {
    return "not-exposed";
  }
}
