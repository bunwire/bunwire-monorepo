# Bunwire 0.1.0 Release Readiness

Status: Release candidate preparation. The packages are not published or tagged by this repository state.

## Package Map

| Package | Purpose | Runtime relationship |
|---|---|---|
| `@bunwire/core` | Application, DI, managed metadata, invocation, middleware, adapter contracts | Platform-independent |
| `@bunwire/vite` | Compiler analysis, generated artifacts, Vite virtual modules | Depends on Core; Vite is a peer API |
| `@bunwire/electrobun` | Electrobun host, RPC, decorators, injectors, middleware, client transport | Depends on Core and Electrobun 1.18.1 |

All three packages are ESM-only and expose one documented root entrypoint with matching TypeScript declarations.

## Supported Initial Integration

- TypeScript 5.9 project analysis and generated declarations.
- Vite 7 through `virtual:bunwire/registry` and `virtual:bunwire/client`.
- Physical `.bunwire` artifacts for manual and non-Vite host builds.
- Electrobun 1.18.1 as the first production host adapter.
- One primary host adapter per Application.

The fake queue example is an architectural extension proof, not a published production adapter.

## Lifecycle and DI Contract

`defineApp()` creates an unstarted Application. `bootstrap.ts` configures and exports it; the host entrypoint imports it and calls `app.start()`. `bunwire.config.*` only bounds build-time discovery and locates that composition root.

Provider `register(container)` runs once during startup. Provider `boot(context)` runs once for each managed invocation, using an isolated invocation container. Managed injectable class kinds may auto-inject by type. Plain classes require explicit `@Inject(Class)` and a runtime binding; interfaces and arbitrary values require a token created by `createToken()`.

Compiler plans preserve real method indexes separately from compact caller argument indexes. Injected and framework-supplied parameters never enter generated caller contracts, and callers never annotate ordinary parameters with `@Arg(index)`.

## Release Verification

```sh
pnpm quality
pnpm performance:sanity
pnpm test:release-pack
pnpm test:clean-install
```

The release audit compares built JavaScript/declaration exports with committed allowlists, inspects tarball contents and manifests, installs all three tarballs into an isolated consumer, typechecks their public APIs, and executes ESM imports. Performance sanity checks publish raw samples for representative compiler analysis, application startup, and managed invocation. Example generation must be byte- and timestamp-stable on its second pass.

The Windows x64 Node 22.17.1 release-candidate baseline measured a 1,343.381 ms median compiler analysis, 0.0057 ms median minimal startup, and 0.00163 ms median managed invocation per call. The release sanity ceilings are deliberately generous at 10,000 ms, 10 ms, and 2 ms respectively. The same run confirmed stable registry/client hashes and no second-pass artifact changes.

## Deferred Until After 0.1.0

- Scopes beyond singleton, transient, and invocation scope.
- Lazy or cycle-breaking dependencies.
- Static interpretation or Vite execution of arbitrary Provider lifecycle code.
- Compile-time proof of dynamic runtime-token bindings.
- High-level clients such as `rpc.users.get(id)` beyond the positional request/message contract.
- Simultaneous unrelated primary host adapters.
- Automatic exposure of public Controller methods or automatic injection of every plain class.
- A required manual `@Arg(index)` calling convention.
- Replacement of platform-native objects or outgoing APIs.
- Configurable middleware lifetimes, numeric priorities, parameter coercion, and production Express integration.
- Complex JavaScript control/data-flow analysis without a demonstrated compiler requirement.

## Publication Boundary

Milestone 13 prepares version `0.1.0` artifacts only. Publishing to npm, creating tags or hosted releases, and configuring credentials/provenance require a separate explicitly authorized release operation.
