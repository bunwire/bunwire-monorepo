# `@bunwire/core`

Core is platform-independent. It defines generic managed-class metadata and the runtime dependency container; it has no Vite or Electrobun dependency.

## Managed class definitions

Use `defineClassKind()` to describe capabilities and `defineManagedClassDecorator()` to associate an outer decorator with that meaning. IDs must be stable lowercase namespaces such as `queue.consumer`. Built-in Service, Controller, and Provider kinds are intentionally not part of Milestones 1–2.

## Container

`Container` supports class, singleton, transient, value, factory, alias, and existing-instance bindings. Custom runtime identities come from `createToken<T>(description)`; concrete or abstract class constructors can also be tokens.

Constructor resolution is driven by explicit `registerConstructorMetadata({ target, dependencies })` entries. Dependency indexes are sorted and preserved, so runtime performs no source analysis. Bindings are required even for class tokens, and the most recent explicit binding wins. Singleton caches belong to each `Container`; aliases resolve through the target binding and preserve its identity.
