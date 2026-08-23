# Bunwire Managed Middleware Architecture

Status: Target architecture for the pre-release Middleware Redesign track (Milestones 12A–12F).

The callback middleware completed in Milestone 12 remains the current implementation until the redesign track is complete. It is superseded as the public API direction and will be removed without a compatibility layer in Milestone 12F.

See [MIDDLEWARE_MILESTONES.md](MIDDLEWARE_MILESTONES.md) for the implementation order and acceptance criteria.

---

## 1. Overview

Bunwire middleware is a managed, class-based, adapter-driven system.

Core standardizes middleware identity, declaration, dependency injection, composition, attachments, parameters, and ordering. The compiler discovers middleware and generates canonical definitions and attachments. Adapters decide how middleware matches and participates in their native runtime.

```text
Bunwire defines the middleware contract.
Adapters define middleware context and runtime integration.
```

Conceptually:

```ts
@Middleware()
export class AuthMiddleware
  implements Middleware<ExpressMiddlewareContext>
{
  protected alias = "auth";
  protected include = ["/admin/**"];
  protected exclude = ["/admin/login"];
  protected only = ["GET", "POST"];

  constructor(private readonly auth: AuthService) {}

  async handle(context, next) {
    await this.auth.verify(context.req);
    return next();
  }
}
```

Middleware follows the same compiled application path as other managed classes:

```text
discovery
    ↓
compiler validation
    ↓
generated registry
    ↓
container / constructor DI
    ↓
adapter-owned filtering and context
    ↓
middleware chain
    ↓
managed Controller invocation
```

---

## 2. Core Contract

Core defines a built-in `core.middleware` managed class kind and canonical `@Middleware()` decorator. Middleware classes are injectable, constructor-analyzed, compiler-discovered, registry-emitted, and transient per invocation.

The generic middleware contract is:

```ts
export interface Middleware<Context = unknown, Result = unknown> {
  handle(
    context: Context,
    next: () => Promise<Result>,
  ): Promise<Result>;
}
```

Middleware owns continuation. It may run before or after `next()`, wrap it with `try`/`finally`, transform its result, propagate its failure, or short-circuit by returning without calling it.

Core does not define HTTP requests, RPC endpoints, transport methods, native windows, webviews, queue messages, or platform path syntax.

### 2.1 Dependency injection and lifetime

Middleware constructor injection follows the same rules as other injectable managed classes:

- injectable managed classes may be inferred by type;
- interfaces, values, aliases, and deliberately bound plain classes require `@Inject(TOKEN)`;
- generated constructor metadata remains authoritative at runtime;
- a middleware instance is resolved from the invocation child container;
- the default and initial middleware lifetime is transient per invocation;
- configurable middleware scopes are not part of the first redesign.

Transient lifetime prevents mutable middleware instance state from leaking between concurrent requests or messages. Dependencies retain their own registered scopes.

### 2.2 Middleware definitions and attachments

A middleware definition describes a canonical class and its compiled metadata:

```text
AuthMiddleware
alias: auth
include: ["/admin/**"]
exclude: ["/admin/login"]
only: ["request"]
```

An attachment describes one use of that middleware:

```text
middleware: AuthMiddleware
parameters: ["admin"]
scope: method
owner: UserController
method: deleteUser
```

Aliases and groups are configuration conveniences. The canonical runtime identity is always the middleware class reference.

---

## 3. Self-Describing Middleware Metadata

Configuration intrinsic to middleware is declared through protected instance fields:

```ts
@Middleware()
export class AuthMiddleware {
  protected alias = "auth";
  protected include = ["/api/**"];
  protected exclude = ["/api/login"];
  protected except = ["OPTIONS"];

  async handle(context, next) {
    return next();
  }
}
```

Supported fields are:

- `alias?: string` — ergonomic application reference;
- `include?: readonly string[]` — adapter-owned path inclusion filters;
- `exclude?: readonly string[]` — adapter-owned path exclusion filters;
- `only?: readonly string[]` — allowed adapter transport kinds;
- `except?: readonly string[]` — excluded adapter transport kinds.

These fields are compiler input. Their initializers must be deterministic literals:

- `alias` must be a non-empty string literal;
- filters must be array literals containing non-empty string literals;
- variables, calls, getters, constructor assignments, spreads, computed values, and environment-dependent expressions are rejected;
- `only` and `except` are mutually exclusive;
- duplicate values within one filter are rejected;
- middleware metadata is emitted into the generated registry, so adapters do not construct middleware merely to inspect it.

An alias is optional when the middleware is referenced only by class. Duplicate aliases fail compilation. An alias and a group may not share a name.

---

## 4. Adapter Middleware Context

The adapter defines the context passed to `handle()`.

An Express adapter might define:

```ts
export interface ExpressMiddlewareContext {
  readonly req: Request;
  readonly res: Response;
  readonly path: string;
  readonly transport: string;
  readonly parameters: readonly string[];
}
```

The Electrobun adapter defines:

```ts
export interface ElectrobunMiddlewareContext {
  readonly endpoint: string;
  readonly transport: "request" | "message";
  readonly window: ElectrobunWindow;
  readonly webview: ElectrobunWebview;
  readonly rpc: ElectrobunRPC;
  readonly args: readonly unknown[];
  readonly parameters: readonly string[];
}
```

Attachment parameters belong to a single middleware execution, not the middleware instance. The adapter creates the context for each attachment with that attachment's parameters.

Core owns the generic chain executor and resolves middleware from the invocation container. The adapter selects applicable attachments, creates their contexts, and supplies the terminal continuation whose meaning is native to the adapter. For Electrobun, the terminal continuation enters `Application.invokeManagedMethod()` and reaches the Controller.

Native middleware remains available. Bunwire integrates with a platform; it does not replace the platform's own middleware APIs.

---

## 5. Local Attachments with `@Use()`

`@Use()` attaches managed middleware close to the code it protects.

Method-level:

```ts
@Use("auth:admin")
@Route("delete")
deleteUser() {}
```

Controller-level:

```ts
@Use("auth")
@Controller("admin")
export class AdminController {}
```

Canonical class references are also valid:

```ts
@Use(AuthMiddleware)
```

`@Use()` accepts one or more middleware references. References in one call retain left-to-right order. Multiple `@Use()` decorators retain top-to-bottom source order.

### 5.1 Parameterized references

String references support Laravel-style parameters:

```ts
@Use("auth:admin,user", "throttle:100,1m")
```

They compile to canonical attachments:

```text
AuthMiddleware
parameters: ["admin", "user"]

ThrottleMiddleware
parameters: ["100", "1m"]
```

Parsing rules for the first version are:

- the first `:` separates the alias/group name from parameters;
- `,` separates parameter values;
- names and parameters are trimmed;
- empty names or parameter entries are invalid;
- parameters remain strings and receive no implicit number/boolean conversion;
- escaping `:` or `,` is not supported initially;
- class references do not carry inline parameters initially; use an alias for parameterized attachment.

The compiler resolves aliases and groups before generation. Runtime adapters never parse middleware reference strings.

---

## 6. Centralized Policy with `withMiddlewares()`

Application-wide policy uses a compiler-readable configuration block:

```ts
export default defineApp()
  .withAdapter(new ElectrobunAdapter())
  .withMiddlewares((registry) => {
    registry.use("request-id", "logger");

    registry.group("authenticated", [
      "auth:user",
      "audit",
    ]);

    registry.group("admin", [
      "auth:admin",
      "audit:security",
      "throttle:100,1m",
    ]);

    registry.controllers({
      "controllers/admin/**": "admin",
      "controllers/account/**": ["authenticated"],
    });
  });
```

### 6.1 Static DSL boundary

The compiler does not execute arbitrary application configuration. The first version permits exactly one direct `withMiddlewares()` call in the exported Application composition chain. Its argument must be a direct callback containing only expression statements that call:

- `registry.use(...references)`;
- `registry.group(name, references)`;
- `registry.controllers(mapping)`.

The DSL accepts literal strings, direct imported middleware class references where applicable, literal arrays, and explicit object properties. It rejects:

- variables containing configuration fragments;
- helper function calls;
- conditional statements and loops;
- spreads;
- computed properties;
- dynamic property access;
- callbacks passed indirectly;
- multiple `withMiddlewares()` blocks.

This restriction keeps discovery deterministic and avoids interpreting arbitrary TypeScript control flow.

At runtime, `Application.withMiddlewares()` validates that it received a callback and marks the Application as middleware-configured, but it does not execute that callback or rebuild policy from it. The callback is a compiler-readable composition DSL, and the generated registry is the sole runtime authority. Manual/prebuilt registry integrations must therefore supply already-normalized middleware definitions and attachments; `withMiddlewares()` is not a runtime fallback compiler.

### 6.2 Global middleware

`registry.use()` attaches middleware globally to every compatible managed method considered by an adapter. Definition-level filters may still prevent execution for a specific event.

### 6.3 Groups

`registry.group()` creates a reusable ordered stack. Groups may contain aliases, canonical class references, parameterized aliases, or previously/later declared groups. Expansion is depth-first and preserves declared order.

The compiler rejects:

- duplicate group names;
- group names that collide with middleware aliases;
- unknown references;
- direct or indirect group cycles;
- empty group names or definitions.

### 6.4 Controller source mappings

`registry.controllers()` applies middleware policy to compiler-discovered Controller source files. Patterns:

- use `/` separators independent of the host OS;
- are matched against each configured source-root-relative file path;
- support ordinary literal segments, `*` within one segment, and `**` across segments;
- are expanded by the compiler into canonical Controller attachments;
- never reach runtime adapters as filesystem patterns.

An unmatched pattern is a compiler error so misspelled security policy cannot silently do nothing.

---

## 7. Ordering and Deduplication

For each managed method, final order is:

```text
global middleware
        ↓
centralized controller mapping middleware
        ↓
controller @Use() middleware
        ↓
method @Use() middleware
        ↓
Controller method
```

Within each scope, registration/source order is preserved. Group expansion occurs in place.

After expansion, the compiler deduplicates exact attachments. An exact attachment has the same canonical middleware class and identical ordered parameter strings. The earliest attachment wins. The same middleware with different parameters remains distinct and executes more than once.

No numeric priority system is included in the first redesign.

---

## 8. Generated Registry

The generated registry is authoritative. It contains:

- canonical middleware class entries;
- compiled aliases and filter metadata;
- constructor dependency plans;
- transient middleware binding scope;
- fully expanded, ordered, deduplicated method attachments;
- canonical middleware class references and immutable parameter arrays.

Conceptually, a generated managed-method plan contains:

```ts
{
  target: UserController,
  method: "deleteUser",
  middleware: [
    { target: RequestIdMiddleware, parameters: [] },
    { target: AuthMiddleware, parameters: ["admin"] },
    { target: AuditMiddleware, parameters: ["security"] },
  ],
}
```

The current callable `ManagedMethodPlan.middleware` representation is replaced by canonical attachment records. Generated modules never import arbitrary middleware callback functions.

Runtime adapters do not resolve aliases, expand groups, interpret controller source patterns, deduplicate attachments, or determine cross-scope ordering.

---

## 9. Runtime Execution

For each native event, an adapter:

1. identifies the generated managed-method plan;
2. obtains its normalized middleware attachments;
3. applies adapter-owned `include`/`exclude` and `only`/`except` matching;
4. creates an adapter-specific context for every applicable attachment;
5. asks Core to resolve transient middleware instances from the invocation child container;
6. executes the ordered chain;
7. supplies Controller invocation as the terminal continuation.

Core guarantees that Provider `boot()`, middleware resolution, middleware execution, and Controller dependency resolution participate in the same invocation scope.

`next()` may be called at most once. Calling it more than once fails clearly. A middleware that does not call `next()` short-circuits the chain. Request results may be returned or transformed. Message results are ignored by the Electrobun transport, while failures follow its configured message-error path.

---

## 10. Filter Semantics

Core stores filter metadata but does not interpret it. Each adapter defines its path and transport vocabulary.

Generic evaluation order is:

1. when `include` exists, at least one include pattern must match;
2. any matching `exclude` pattern rejects the middleware, even after an include match;
3. when `only` exists, the event transport must be listed;
4. when `except` exists, a listed event transport rejects the middleware;
5. no filter means the attachment applies.

For Electrobun:

- path filters match the normalized endpoint, such as `users/get`;
- leading/trailing `/` in metadata is normalized consistently with endpoint paths;
- `*` matches within one path segment;
- `**` matches across path segments;
- valid transport values are `request` and `message`;
- invalid Electrobun transport filters fail compiler or adapter validation before traffic is accepted.

Future adapters may use different path matching and transport values without changing Core or generic Vite analysis.

---

## 11. Electrobun Integration

For a request to `users/delete`, Electrobun conceptually executes:

```text
native RPC request
        ↓
generated endpoint plan
        ↓
filter generated middleware attachments
        ↓
create ElectrobunMiddlewareContext per attachment
        ↓
LoggerMiddleware
        ↓
AuthMiddleware(parameters: ["admin"])
        ↓
AuditMiddleware
        ↓
Application.invokeManagedMethod()
        ↓
UserController.deleteUser()
```

The context exposes the exact native window, webview, and RPC objects already owned by the adapter. Native Electrobun outgoing communication and listeners remain available.

Requests propagate middleware/controller results through native RPC. Messages are fire-and-forget and route failures through `onMessageError` or the existing fallback logging behavior.

---

## 12. Validation and Diagnostics

The compiler fails closed for:

- counterfeit `@Middleware()` or `@Use()` symbols;
- middleware classes that are anonymous, unexported, abstract, or lack a concrete callable `handle()`;
- invalid constructor dependencies;
- non-literal metadata fields;
- `only` and `except` used together;
- duplicate aliases;
- alias/group name collisions;
- unknown middleware references;
- malformed parameterized references;
- group cycles;
- invalid or unmatched controller patterns;
- `@Use()` on unsupported targets;
- duplicate or malformed generated identities.

Runtime validation remains authoritative for generated-looking JavaScript input. It validates canonical middleware class identity, immutable string parameters, transient binding metadata, attachment ownership, adapter registration, and pipeline structure before accepting traffic.

---

## 13. Transition from Callback Middleware

Milestone 12 introduced:

```ts
export const loggingMiddleware: ManagedMethodMiddleware = async (invocation, next) => {
  return next();
};

@Use(loggingMiddleware)
@Route("get")
get() {}
```

That implementation is historical scaffolding and not the release API. The replacement is:

```ts
@Middleware()
export class LoggingMiddleware
  implements Middleware<ElectrobunMiddlewareContext>
{
  protected alias = "logger";

  async handle(context, next) {
    return next();
  }
}

@Use("logger")
@Route("get")
get() {}
```

Milestones 12A–12E may temporarily retain internal callback support to keep the repository green while vertical behavior is built. Milestone 12F removes:

- `ManagedMethodMiddleware`;
- callable `ManagedMethodPlan.middleware` entries;
- callback-oriented `@Use(exportedFunction)`;
- compiler imports of middleware callback functions;
- callback middleware examples and tests.

No permanent deprecation bridge or parallel callback API remains before Milestone 13.

---

## 14. Initial Non-Goals

The first managed middleware release does not include:

- configurable singleton middleware scope;
- numeric priorities;
- parameter escaping or typed parameter coercion;
- universal cross-adapter path syntax;
- automatic conversion of native Express/Electrobun middleware into Bunwire classes;
- runtime alias/group expansion;
- runtime filesystem matching;
- arbitrary code execution inside `withMiddlewares()` compilation;
- replacement of native platform middleware APIs.

The goal is one coherent managed middleware model without flattening the native platforms it integrates.
