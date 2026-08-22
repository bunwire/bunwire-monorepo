# `@bunwire/vite`

Milestone 7 establishes Bunwire's bounded build-time discovery layer. The package does not yet implement a Vite plugin hook or generate runtime registries; those belong to later milestones.

## Configuration

Place one `bunwire.config.*` file at the project root:

```ts
import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./src/bun/bootstrap.ts",
});
```

Milestone 7 accepts literal project-root-relative `source` and `bootstrap` paths. `source` may also be an array. Config loading is declarative: the loader parses this object rather than importing and executing the config module. Missing, malformed, ambiguous, absolute, and project-escaping paths produce typed `BunwireCompilerError` diagnostics.

## Discovery

`loadBunwireConfig()` resolves and contains the configured paths. `discoverBunwireSourceFiles()` returns a frozen, deterministically sorted list of JavaScript/TypeScript source files, excluding declaration files and anything outside the configured roots. `discoverBunwireApplication()` combines that graph with bootstrap adapter discovery and compiler-extension aggregation.

The bootstrap must export a composition rooted at a statically imported `defineApp()` and configure exactly one primary adapter with a direct expression such as:

```ts
export default defineApp().withAdapter(new HostAdapter({ /* runtime options */ }));
```

Discovery resolves the imported adapter class and reads its own static `compiler` data property. It does not import the bootstrap, construct the adapter, evaluate constructor arguments, invoke configuration callbacks, or start the Application. Loading the selected adapter's compiled JavaScript module performs normal module initialization, so compiler descriptors must remain declarative and side-effect-free.

Compiler-extension aggregation seeds Core's canonical built-in class kinds, validates adapter class/method/decorator ownership, and rejects conflicting IDs. The `virtual:bunwire/*` namespace is reserved for generated modules, but Milestone 7 emits none.

Managed-class discovery, TypeScript symbol/type analysis, constructor DI inference, invocation-plan compilation, and registry generation begin in Milestone 8 or later.
