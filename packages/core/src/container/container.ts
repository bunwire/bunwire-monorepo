import type {
  Binding,
  BindingFactory,
  BindingScope,
  ClassBinding,
  FactoryBinding,
} from "./bindings.js";
import { circularResolutionError, missingBindingError } from "./errors.js";
import {
  normalizeConstructorMetadata,
  type ConstructorMetadata,
} from "./metadata.js";
import {
  isClassToken,
  type ClassToken,
  type Constructable,
  type RuntimeToken,
} from "./tokens.js";

type UnknownRuntimeToken = RuntimeToken<unknown>;
type UnknownBinding = Binding<unknown>;

interface LocatedBinding {
  readonly binding: UnknownBinding;
  readonly owner: Container;
}

function eraseToken<Value>(token: RuntimeToken<Value>): UnknownRuntimeToken {
  return token as UnknownRuntimeToken;
}

function isNativeClass(value: Function): boolean {
  return /^class\s/.test(Function.prototype.toString.call(value));
}

export class Container {
  readonly #bindings = new Map<UnknownRuntimeToken, UnknownBinding>();
  readonly #constructorMetadata = new Map<Constructable, ConstructorMetadata>();
  readonly #singletonInstances = new Map<UnknownRuntimeToken, unknown>();
  #activeResolutionChain: UnknownRuntimeToken[] | undefined;

  readonly parent: Container | undefined;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  get root(): Container {
    return this.parent?.root ?? this;
  }

  createChild(): Container {
    return new Container(this);
  }

  has<Value>(token: RuntimeToken<Value>, includeParents = true): boolean {
    const erasedToken = eraseToken(token);
    return this.#bindings.has(erasedToken) || (
      includeParents && this.parent?.has(erasedToken) === true
    );
  }

  bind<Value>(implementation: Constructable<Value>): this;
  bind<Value>(token: RuntimeToken<Value>, implementation: Constructable<Value>): this;
  bind<Value>(
    tokenOrImplementation: RuntimeToken<Value> | Constructable<Value>,
    implementation?: Constructable<Value>,
  ): this {
    const token = tokenOrImplementation as RuntimeToken<Value>;
    const resolvedImplementation = implementation ?? (
      isClassToken(tokenOrImplementation) ? tokenOrImplementation as Constructable<Value> : undefined
    );
    if (!resolvedImplementation) {
      throw new TypeError("A class implementation is required when binding a custom token.");
    }
    return this.setBinding(token, {
      type: "class",
      implementation: resolvedImplementation,
      scope: "transient",
    });
  }

  singleton<Value>(implementation: Constructable<Value>): this;
  singleton<Value>(token: RuntimeToken<Value>, implementation: Constructable<Value>): this;
  singleton<Value>(token: RuntimeToken<Value>, factory: BindingFactory<Value>): this;
  singleton<Value>(
    tokenOrImplementation: RuntimeToken<Value> | Constructable<Value>,
    implementationOrFactory?: Constructable<Value> | BindingFactory<Value>,
  ): this {
    const token = tokenOrImplementation as RuntimeToken<Value>;
    const resolver = implementationOrFactory ?? (
      isClassToken(tokenOrImplementation) ? tokenOrImplementation as Constructable<Value> : undefined
    );
    if (!resolver) {
      throw new TypeError("A class implementation or factory is required when binding a custom token.");
    }

    if (isNativeClass(resolver)) {
      return this.setBinding(token, {
        type: "class",
        implementation: resolver as Constructable<Value>,
        scope: "singleton",
      });
    }
    return this.setBinding(token, {
      type: "factory",
      factory: resolver as BindingFactory<Value>,
      scope: "singleton",
    });
  }

  transient<Value>(implementation: Constructable<Value>): this;
  transient<Value>(token: RuntimeToken<Value>, implementation: Constructable<Value>): this;
  transient<Value>(
    tokenOrImplementation: RuntimeToken<Value> | Constructable<Value>,
    implementation?: Constructable<Value>,
  ): this {
    return this.bind(tokenOrImplementation as RuntimeToken<Value>, implementation as Constructable<Value>);
  }

  value<Value>(token: RuntimeToken<Value>, value: Value): this {
    return this.setBinding(token, { type: "value", value });
  }

  instance<Value>(token: RuntimeToken<Value>, instance: Value): this {
    return this.setBinding(token, { type: "instance", value: instance });
  }

  factory<Value>(
    token: RuntimeToken<Value>,
    factory: BindingFactory<Value>,
    scope: BindingScope = "transient",
  ): this {
    return this.setBinding(token, { type: "factory", factory, scope });
  }

  alias<Value>(alias: RuntimeToken<Value>, target: RuntimeToken<Value>): this {
    return this.setBinding(alias, { type: "alias", target });
  }

  registerConstructorMetadata<Value>(metadata: ConstructorMetadata<Value>): this {
    const normalized = normalizeConstructorMetadata(metadata);
    this.#constructorMetadata.set(normalized.target, normalized as ConstructorMetadata);
    this.evictSingletonsForImplementation(normalized.target);
    return this;
  }

  get<Value>(token: RuntimeToken<Value>): Value {
    const isRootResolution = this.#activeResolutionChain === undefined;
    if (isRootResolution) {
      this.#activeResolutionChain = [];
    }

    try {
      return this.resolve(eraseToken(token), this.#activeResolutionChain as UnknownRuntimeToken[]) as Value;
    } finally {
      if (isRootResolution) {
        this.#activeResolutionChain = undefined;
      }
    }
  }

  private setBinding<Value>(token: RuntimeToken<Value>, binding: Binding<Value>): this {
    const erasedToken = eraseToken(token);
    this.#bindings.set(erasedToken, binding as UnknownBinding);
    this.#singletonInstances.delete(erasedToken);
    return this;
  }

  private resolve(token: UnknownRuntimeToken, chain: UnknownRuntimeToken[]): unknown {
    const cycleStart = chain.indexOf(token);
    if (cycleStart >= 0) {
      throw circularResolutionError([...chain.slice(cycleStart), token]);
    }

    const located = this.findBinding(token);
    if (!located) {
      throw missingBindingError(token, chain);
    }

    chain.push(token);
    try {
      const { binding, owner } = located;
      switch (binding.type) {
        case "value":
        case "instance":
          return binding.value;
        case "alias":
          return this.resolve(eraseToken(binding.target), chain);
        case "class":
          return this.resolveScoped(token, binding, owner, chain);
        case "factory":
          return this.resolveScoped(token, binding, owner, chain);
      }
    } finally {
      chain.pop();
    }
  }

  private resolveScoped(
    token: UnknownRuntimeToken,
    binding: ClassBinding | FactoryBinding,
    owner: Container,
    chain: UnknownRuntimeToken[],
  ): unknown {
    if (binding.scope === "transient") {
      return this.createFromBinding(binding, chain);
    }
    if (owner.#singletonInstances.has(token)) {
      return owner.#singletonInstances.get(token);
    }
    const instance = owner.createFromBinding(binding, chain);
    owner.#singletonInstances.set(token, instance);
    return instance;
  }

  private createFromBinding(
    binding: ClassBinding | FactoryBinding,
    chain: UnknownRuntimeToken[],
  ): unknown {
    return binding.type === "class"
      ? this.construct(binding.implementation, chain)
      : binding.factory(this);
  }

  private construct<Value>(implementation: Constructable<Value>, chain: UnknownRuntimeToken[]): Value {
    const metadata = this.findConstructorMetadata(implementation);
    if (!metadata || metadata.dependencies.length === 0) {
      return new implementation();
    }

    const highestIndex = metadata.dependencies[metadata.dependencies.length - 1]?.index ?? -1;
    const argumentsList = Array.from<unknown>({ length: highestIndex + 1 });
    for (const dependency of metadata.dependencies) {
      argumentsList[dependency.index] = this.resolve(eraseToken(dependency.token), chain);
    }
    return new implementation(...argumentsList);
  }

  private evictSingletonsForImplementation(implementation: Constructable): void {
    for (const [token, binding] of this.#bindings) {
      if (binding.type === "class" && binding.implementation === implementation) {
        this.#singletonInstances.delete(token);
      }
    }
  }

  private findBinding(token: UnknownRuntimeToken): LocatedBinding | undefined {
    const binding = this.#bindings.get(token);
    if (binding) {
      return { binding, owner: this };
    }
    return this.parent?.findBinding(token);
  }

  private findConstructorMetadata(implementation: Constructable): ConstructorMetadata | undefined {
    return this.#constructorMetadata.get(implementation)
      ?? this.parent?.findConstructorMetadata(implementation);
  }
}
