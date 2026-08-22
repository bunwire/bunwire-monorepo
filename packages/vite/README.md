# `@bunwire/vite`

Milestones 7–9 establish Bunwire's bounded discovery and TypeScript analysis layer. The package does not yet generate runtime registry modules; that begins in Milestone 10.

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

`loadBunwireConfig()` resolves and contains the configured paths. `discoverBunwireSourceFiles()` returns a frozen, deterministically sorted list of JavaScript/TypeScript source files, excluding declaration files and anything outside the configured roots. Canonical directories are visited once, so contained filesystem aliases and cycles terminate; broken or inaccessible links produce typed diagnostics. `discoverBunwireApplication()` combines that graph with bootstrap adapter discovery and compiler-extension aggregation.

The bootstrap must export a composition rooted at a statically imported `defineApp()` and configure exactly one primary adapter with a direct expression such as:

```ts
export default defineApp().withAdapter(new HostAdapter({ /* runtime options */ }));
```

Discovery follows only the receiver-call chain of that default export. Adapter-like calls in unused functions, dormant branches, callbacks, constructor arguments, or unrelated expressions do not participate. It resolves the imported adapter class and reads its own static `compiler` data property. Package exports use ESM-compatible `node`, `import`, and `default` conditions in declaration order; a `require` condition cannot silently select different compiler metadata. Discovery does not import the bootstrap, construct the adapter, evaluate constructor arguments, invoke configuration callbacks, or start the Application. Loading the selected adapter's compiled JavaScript module performs normal module initialization, so compiler descriptors must remain declarative and side-effect-free.

Compiler-extension aggregation seeds Core's canonical built-in class kinds, validates adapter class/method/decorator ownership, and rejects conflicting IDs. The `virtual:bunwire/*` namespace is reserved for generated modules, but Milestones 7–9 emit none.

## Symbol and parameter analysis

`createBunwireProgram()` creates one TypeScript `Program` and checker over the configured source universe. `analyzeBunwireProgram()` reuses that context to resolve decorator/type aliases by symbol, discover canonical managed class kinds, compile indexed constructor dependencies, and compile every managed-method parameter.

`analyzeBunwireApplication()` is the integrated entrypoint: it runs Milestone 7 configuration/source/adapter discovery and returns that result together with the Milestones 8–9 analysis.

Constructor parameters must use explicit `@Inject(TOKEN)` or resolve to a managed class kind with `injectable: true`; plain classes and erased interfaces produce source-located diagnostics. Managed methods classify registered parameter injectors first, explicit `@Inject()` second, injectable managed types third, and every remaining parameter as caller-visible transport input. Each method result preserves true `methodIndex` values independently from compact `argumentIndex` values, including optional and final-rest semantics plus minimum/maximum caller bounds.

Compiler runtime references retain the source expression, resolved symbol name, use location, and declaration location. Runtime packages do not scan source or infer signatures. Registry module generation remains intentionally deferred to Milestone 10.
