import type { Container } from "./container.js";
import type { Constructable, RuntimeToken } from "./tokens.js";

export type BindingScope = "singleton" | "transient";
export type BindingFactory<Value> = (container: Container) => Value;

export interface ClassBinding<Value = unknown> {
  readonly type: "class";
  readonly implementation: Constructable<Value>;
  readonly scope: BindingScope;
}

export interface ValueBinding<Value = unknown> {
  readonly type: "value";
  readonly value: Value;
}

export interface InstanceBinding<Value = unknown> {
  readonly type: "instance";
  readonly value: Value;
}

export interface FactoryBinding<Value = unknown> {
  readonly type: "factory";
  readonly factory: BindingFactory<Value>;
  readonly scope: BindingScope;
}

export interface AliasBinding<Value = unknown> {
  readonly type: "alias";
  readonly target: RuntimeToken<Value>;
}

export type Binding<Value = unknown> =
  | ClassBinding<Value>
  | ValueBinding<Value>
  | InstanceBinding<Value>
  | FactoryBinding<Value>
  | AliasBinding<Value>;
