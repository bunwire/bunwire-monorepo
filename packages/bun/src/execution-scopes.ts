import {
  Container,
  createToken,
  describeToken,
  isClassToken,
  isToken,
  type RuntimeToken,
  type Token,
} from "@bunwire/core";

export type BunExecutionScopeKind =
  | "application"
  | "http-request"
  | "queue-job"
  | "command"
  | "scheduled-task"
  | "websocket-connection"
  | "websocket-message";

export type BunChildExecutionScopeKind = Exclude<BunExecutionScopeKind, "application">;
export type BunExecutionScopeState = "active" | "closing" | "disposed";
export type BunExecutionScopeManagerState = "active" | "closing" | "disposed";

export interface BunExecutionScopeDescriptor<Kind extends BunExecutionScopeKind = BunExecutionScopeKind> {
  readonly id: Kind;
  readonly parentKinds: readonly BunExecutionScopeKind[];
}

export type BunExecutionScopeDescriptorMap = Readonly<{
  [Kind in BunExecutionScopeKind]: BunExecutionScopeDescriptor<Kind>;
}>;

function defineDescriptor<Kind extends BunExecutionScopeKind>(
  id: Kind,
  parentKinds: readonly BunExecutionScopeKind[],
): BunExecutionScopeDescriptor<Kind> {
  return Object.freeze({ id, parentKinds: Object.freeze([...parentKinds]) });
}

export const BUN_EXECUTION_SCOPE_DESCRIPTORS: BunExecutionScopeDescriptorMap = Object.freeze({
  application: defineDescriptor("application", []),
  "http-request": defineDescriptor("http-request", ["application"]),
  "queue-job": defineDescriptor("queue-job", ["application"]),
  command: defineDescriptor("command", ["application"]),
  "scheduled-task": defineDescriptor("scheduled-task", ["application"]),
  "websocket-connection": defineDescriptor("websocket-connection", ["application"]),
  "websocket-message": defineDescriptor("websocket-message", ["websocket-connection"]),
});

export type BunScopedFactory<Value> = (scope: BunExecutionScope) => Value;
export type BunScopedDisposer<Value> = (
  value: Value,
  scope: BunExecutionScope,
) => void | Promise<void>;

export interface BunScopedResourceOptions<Value> {
  readonly dispose?: BunScopedDisposer<Value>;
}

export interface BunExecutionScopeCreateOptions {
  readonly parent?: BunExecutionScope;
}

export interface BunExecutionScopeRunOptions extends BunExecutionScopeCreateOptions {
  readonly configure?: (scope: BunExecutionScope) => void | Promise<void>;
}

export type BunExecutionScopeHandler<Result> = (
  scope: BunExecutionScope,
) => Result | Promise<Result>;

interface ResolvedResource {
  readonly dispose: () => void | Promise<void>;
}

const scopeManagers = new WeakMap<BunExecutionScope, BunExecutionScopeManager>();

function appendDisposalError(errors: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) appendDisposalError(errors, nested);
    return;
  }
  errors.push(error);
}

export class BunExecutionScopeError extends Error {
  override readonly name = "BunExecutionScopeError";
}

function assertRuntimeToken(token: unknown): asserts token is RuntimeToken<unknown> {
  if (!isToken(token) && !isClassToken(token)) {
    throw new BunExecutionScopeError(
      "Execution-scope bindings require a valid Core runtime token or constructable class.",
    );
  }
}

function describeScope(scope: BunExecutionScope): string {
  return `${scope.kind}#${scope.id}`;
}

export const BUN_EXECUTION_SCOPE_MANAGER: Token<BunExecutionScopeManager> =
  createToken<BunExecutionScopeManager>("bunwire.bun.execution-scope-manager");

export const BUN_EXECUTION_SCOPE: Token<BunExecutionScope> =
  createToken<BunExecutionScope>("bunwire.bun.execution-scope");

export class BunExecutionScope {
  readonly #manager: BunExecutionScopeManager;
  readonly #descriptor: BunExecutionScopeDescriptor;
  readonly #parent: BunExecutionScope | undefined;
  readonly #container: Container;
  readonly #children: BunExecutionScope[] = [];
  readonly #localTokens = new Set<RuntimeToken<unknown>>();
  readonly #resources: ResolvedResource[] = [];
  #state: BunExecutionScopeState = "active";
  #disposePromise: Promise<void> | undefined;

  readonly id: number;

  constructor(
    manager: BunExecutionScopeManager,
    id: number,
    descriptor: BunExecutionScopeDescriptor,
    container: Container,
    parent?: BunExecutionScope,
  ) {
    this.#manager = manager;
    this.id = id;
    this.#descriptor = descriptor;
    this.#container = container;
    this.#parent = parent;
    scopeManagers.set(this, manager);
  }

  get kind(): BunExecutionScopeKind {
    return this.#descriptor.id;
  }

  get descriptor(): BunExecutionScopeDescriptor {
    return this.#descriptor;
  }

  get state(): BunExecutionScopeState {
    return this.#state;
  }

  get parent(): BunExecutionScope | undefined {
    return this.#parent;
  }

  get container(): Container {
    return this.#container;
  }

  value<Value>(
    token: RuntimeToken<Value>,
    value: Value,
    options: BunScopedResourceOptions<Value> = {},
  ): this {
    this.assertActive("register a value");
    const disposer = options.dispose;
    this.assertDisposer(disposer);
    this.assertNewLocalToken(token);
    this.#container.value(token, value);
    if (disposer) {
      this.#resources.push({ dispose: () => disposer(value, this) });
    }
    return this;
  }

  scoped<Value>(
    token: RuntimeToken<Value>,
    factory: BunScopedFactory<Value>,
    options: BunScopedResourceOptions<Value> = {},
  ): this {
    this.assertActive("register a scoped service");
    if (typeof factory !== "function") {
      throw new BunExecutionScopeError("A scoped service factory must be callable.");
    }
    const disposer = options.dispose;
    this.assertDisposer(disposer);
    this.assertNewLocalToken(token);
    this.#container.factory(token, () => {
      this.assertActive("resolve a scoped service");
      const value = factory(this);
      if (disposer) {
        this.#resources.push({ dispose: () => disposer(value, this) });
      }
      return value;
    }, "singleton");
    return this;
  }

  resolve<Value>(token: RuntimeToken<Value>): Value {
    this.assertActive("resolve a value");
    return this.#container.get(token);
  }

  dispose(): Promise<void> {
    if (this.kind === "application") {
      return this.#manager.dispose();
    }
    return this.disposeDirect();
  }

  addChild(scope: BunExecutionScope): void {
    this.assertActive("create a child scope");
    this.#children.push(scope);
  }

  removeChild(scope: BunExecutionScope): void {
    const index = this.#children.indexOf(scope);
    if (index >= 0) this.#children.splice(index, 1);
  }

  disposeDirect(): Promise<void> {
    if (!this.#disposePromise) {
      this.#state = "closing";
      this.#disposePromise = this.performDispose();
    }
    return this.#disposePromise;
  }

  private async performDispose(): Promise<void> {
    const errors: unknown[] = [];
    for (const child of [...this.#children].reverse()) {
      try {
        await child.disposeDirect();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    for (const resource of [...this.#resources].reverse()) {
      try {
        await resource.dispose();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    this.#state = "disposed";
    this.#parent?.removeChild(this);
    this.#manager.scopeDisposed(this);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `Execution scope ${describeScope(this)} disposal failed.`);
    }
  }

  private assertActive(operation: string): void {
    if (this.#state !== "active") {
      throw new BunExecutionScopeError(
        `Cannot ${operation} in execution scope ${describeScope(this)} while it is ${this.#state}.`,
      );
    }
  }

  private assertNewLocalToken(token: unknown): asserts token is RuntimeToken<unknown> {
    assertRuntimeToken(token);
    if (this.#localTokens.has(token)) {
      throw new BunExecutionScopeError(
        `${describeToken(token)} is already registered locally in execution scope ${describeScope(this)}.`,
      );
    }
    this.#localTokens.add(token);
  }

  private assertDisposer<Value>(disposer: BunScopedDisposer<Value> | undefined): void {
    if (disposer !== undefined && typeof disposer !== "function") {
      throw new BunExecutionScopeError("A scoped resource disposer must be callable when supplied.");
    }
  }
}

interface ActiveRun {
  readonly settled: Promise<void>;
}

export class BunExecutionScopeManager {
  readonly #applicationScope: BunExecutionScope;
  readonly #scopes: BunExecutionScope[] = [];
  readonly #activeRuns = new Set<ActiveRun>();
  readonly #shutdownDisposalErrors: unknown[] = [];
  #state: BunExecutionScopeManagerState = "active";
  #nextScopeId = 1;
  #disposePromise: Promise<void> | undefined;

  constructor(rootContainer: Container) {
    if (!(rootContainer instanceof Container)) {
      throw new BunExecutionScopeError("BunExecutionScopeManager requires a Core Container.");
    }
    this.#applicationScope = new BunExecutionScope(
      this,
      this.#nextScopeId++,
      BUN_EXECUTION_SCOPE_DESCRIPTORS.application,
      rootContainer,
    );
    rootContainer.value(BUN_EXECUTION_SCOPE_MANAGER, this);
    rootContainer.value(BUN_EXECUTION_SCOPE, this.#applicationScope);
  }

  get state(): BunExecutionScopeManagerState {
    return this.#state;
  }

  get applicationScope(): BunExecutionScope {
    return this.#applicationScope;
  }

  get activeScopeCount(): number {
    return this.#scopes.length;
  }

  create(
    kind: BunChildExecutionScopeKind,
    options: BunExecutionScopeCreateOptions = {},
  ): BunExecutionScope {
    this.assertActive();
    const descriptor = BUN_EXECUTION_SCOPE_DESCRIPTORS[kind] as
      BunExecutionScopeDescriptor | undefined;
    if (!descriptor || kind === ("application" as BunChildExecutionScopeKind)) {
      throw new BunExecutionScopeError(
        `Unknown or non-child Bun execution-scope kind ${JSON.stringify(kind)}.`,
      );
    }
    const parent = options.parent ?? this.#applicationScope;
    if (!(parent instanceof BunExecutionScope) || scopeManagers.get(parent) !== this) {
      throw new BunExecutionScopeError("Execution-scope parent must belong to this manager.");
    }
    if (parent.state !== "active") {
      throw new BunExecutionScopeError(
        `Cannot create a child under execution scope ${describeScope(parent)} while it is ${parent.state}.`,
      );
    }
    if (!descriptor.parentKinds.includes(parent.kind)) {
      throw new BunExecutionScopeError(
        `Execution scope kind "${kind}" requires parent kind ${descriptor.parentKinds.map((entry) => `"${entry}"`).join(" or ")}; received "${parent.kind}".`,
      );
    }
    const scope = new BunExecutionScope(
      this,
      this.#nextScopeId++,
      descriptor,
      parent.container.createChild(),
      parent,
    );
    parent.addChild(scope);
    scope.container.value(BUN_EXECUTION_SCOPE, scope);
    this.#scopes.push(scope);
    return scope;
  }

  async run<Result>(
    kind: BunChildExecutionScopeKind,
    handler: BunExecutionScopeHandler<Result>,
    options: BunExecutionScopeRunOptions = {},
  ): Promise<Result> {
    if (typeof handler !== "function") {
      throw new BunExecutionScopeError("Execution-scope handler must be callable.");
    }
    const scope = this.create(kind, options);
    let settleRun!: () => void;
    const activeRun: ActiveRun = {
      settled: new Promise<void>((resolve) => {
        settleRun = resolve;
      }),
    };
    this.#activeRuns.add(activeRun);

    let result!: Result;
    let executionError: unknown;
    let hasExecutionError = false;
    try {
      await options.configure?.(scope);
      result = await handler(scope);
    } catch (error) {
      executionError = error;
      hasExecutionError = true;
    }

    let disposalError: unknown;
    let hasDisposalError = false;
    try {
      await scope.disposeDirect();
    } catch (error) {
      disposalError = error;
      hasDisposalError = true;
      if (this.#state === "closing") appendDisposalError(this.#shutdownDisposalErrors, error);
    } finally {
      this.#activeRuns.delete(activeRun);
      settleRun();
    }

    if (hasExecutionError && hasDisposalError) {
      throw new AggregateError(
        [executionError, disposalError],
        `Execution and disposal both failed for scope ${describeScope(scope)}.`,
      );
    }
    if (hasExecutionError) throw executionError;
    if (hasDisposalError) throw disposalError;
    return result;
  }

  dispose(): Promise<void> {
    if (!this.#disposePromise) {
      this.#state = "closing";
      this.#disposePromise = this.performDispose();
    }
    return this.#disposePromise;
  }

  scopeDisposed(scope: BunExecutionScope): void {
    const index = this.#scopes.indexOf(scope);
    if (index >= 0) this.#scopes.splice(index, 1);
  }

  private async performDispose(): Promise<void> {
    await Promise.allSettled([...this.#activeRuns].map((run) => run.settled));
    const errors = [...this.#shutdownDisposalErrors];
    for (const scope of [...this.#scopes].reverse()) {
      if (scope.state === "disposed") continue;
      try {
        await scope.disposeDirect();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    try {
      await this.#applicationScope.disposeDirect();
    } catch (error) {
      appendDisposalError(errors, error);
    }
    this.#state = "disposed";
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Bun execution-scope manager disposal failed.");
    }
  }

  private assertActive(): void {
    if (this.#state !== "active") {
      throw new BunExecutionScopeError(
        `Cannot create an execution scope while the manager is ${this.#state}.`,
      );
    }
  }
}
