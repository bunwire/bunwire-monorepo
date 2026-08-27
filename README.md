# Bunwire

Bunwire is a TypeScript application kernel and compiler for managed classes, dependency injection, generated invocation plans, adapter-owned host integration, and caller-safe frontend contracts. Electrobun is the first production adapter; the compiler and Core extension APIs remain platform-independent.

## Packages

- `@bunwire/core` — Application lifecycle, bindings, tokens, managed classes and methods, middleware, canonical events/listeners, runtime registries, and adapter extension contracts.
- `@bunwire/vite` — bounded source discovery, TypeScript analysis, generated registries/clients, physical artifacts, and `virtual:bunwire/*` Vite modules.
- `@bunwire/electrobun` — Electrobun startup, RPC dispatch, managed decorators/injectors, middleware context, and generated-client transport integration.

## Install

```sh
pnpm add @bunwire/core @bunwire/electrobun
pnpm add -D @bunwire/vite vite
```

Define the bounded build graph in `bunwire.config.ts`, export an unstarted Application from `bootstrap.ts`, and start that Application from the host entrypoint. Vite applications consume `virtual:bunwire/registry` and `virtual:bunwire/client`; manual or non-Vite builds generate the equivalent `.bunwire` physical artifacts.

See the [architecture](docs/README.md), [Electrobun example](examples/electrobun-app/README.md), [Vite/compiler guide](packages/vite/README.md), and [0.1.0 release readiness record](docs/RELEASE.md).

## Development

```sh
pnpm install --frozen-lockfile
pnpm quality
pnpm test:clean-install
```

The repository uses pnpm workspaces and TypeScript project references. Package boundaries are mechanically checked before tests and builds.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
