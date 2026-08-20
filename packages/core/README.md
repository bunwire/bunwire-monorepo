# `@bunwire/core`

Core is platform-independent. It defines generic managed-class metadata and the runtime dependency container; it has no Vite or Electrobun dependency.

## Managed class definitions

Use `defineClassKind()` to describe capabilities and `defineManagedClassDecorator()` to associate an outer decorator with that meaning. IDs must be stable lowercase namespaces such as `queue.consumer`.

Core's built-in specializations use that same API:

- `@Service({ scope: "singleton" | "transient" })` describes injectable business/application classes. The default scope metadata is `singleton`; ordinary Service methods are not managed methods.
- `@Controller(prefix?)` describes injectable, registry-managed classes that may own adapter-defined managed methods. The optional prefix is retained as generic metadata for adapters.
- `@Provider()` describes registry-managed lifecycle classes with the known `register` and `boot` hooks. These hooks are lifecycle metadata, not ordinary managed methods or routes.

In v1 Bunwire constructs Providers with zero supplied constructor arguments and performs no Provider constructor injection. A Provider constructor must therefore require zero arguments. Dependencies and bindings needed during startup are handled through the framework-owned `register(container)` hook. Provider lifecycle execution begins in Milestone 4.

## Container

`Container` supports class, singleton, transient, value, factory, alias, and existing-instance bindings. Custom runtime identities come from `createToken<T>(description)`; concrete or abstract class constructors can also be tokens.

Constructor resolution is driven by explicit `registerConstructorMetadata({ target, dependencies })` entries. Dependency indexes are sorted and preserved, so runtime performs no source analysis. Bindings are required even for class tokens, and the most recent explicit binding wins. Singleton caches belong to each `Container`; aliases resolve through the target binding and preserve its identity.
