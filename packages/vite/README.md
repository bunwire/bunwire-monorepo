# `@bunwire/vite`

Milestones 7–10 establish Bunwire's bounded discovery, TypeScript analysis, deterministic registry generation, and Vite virtual-module layer.

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

Compiler-extension aggregation seeds Core's canonical built-in class kinds, validates adapter class/method/decorator ownership, and rejects conflicting IDs or compiler-symbol assignments. Each registered decorator/injector definition names its canonical public module export through `compilerSymbol`; analysis resolves that export inside the Program and compares exact TypeScript symbols after following aliases and re-exports. A different symbol cannot gain authority by copying a registered ID. The `virtual:bunwire/*` namespace is reserved for generated modules, but Milestones 7–9 emit none.

## Symbol and parameter analysis

`createBunwireProgram()` creates one TypeScript `Program` and checker over the configured source universe. `analyzeBunwireProgram()` reuses that context to resolve decorator/type aliases by symbol, discover canonical managed class kinds, compile indexed constructor dependencies, and compile every managed-method parameter.

`analyzeBunwireApplication()` is the integrated entrypoint: it runs Milestone 7 configuration/source/adapter discovery and returns that result together with the Milestones 8–9 analysis.

Constructor parameters must use explicit `@Inject(TOKEN)` or resolve to a managed class kind with `injectable: true`; plain classes, invalid runtime-token values, `any`, `unknown`, and erased interfaces produce source-located diagnostics. A managed subclass may use an implicit constructor only when its effective constructor has no parameters; otherwise it must declare an explicit forwarding constructor. Statically known managed-class dependency cycles fail at compile time with their cycle path.

Managed methods classify registered parameter injectors first, explicit `@Inject()` second, injectable managed types third, and every remaining parameter as caller-visible transport input. Each method result preserves true `methodIndex` values independently from compact `argumentIndex` values, including optional and final-rest semantics plus minimum/maximum caller bounds. Managed methods must be concrete instance methods; static, abstract, and declaration-only methods are rejected before registry generation.

Compiler runtime references retain the source expression, resolved exported symbol, use location, and declaration location. Managed classes and runtime tokens must be exported so generated modules can import them. Runtime packages do not scan source or infer signatures.

## Generated registry module

`generateRuntimeRegistryModule()` converts the completed analysis into deterministic TypeScript containing class metadata, constructor dependencies, Providers, managed-method plans, resolver IDs, adapter metadata, and middleware arrays. Imports and records are sorted independently of filesystem enumeration order, and `BUNWIRE_REGISTRY_HASH` identifies the byte-stable generated body.

`bunwire()` exposes that same output through `virtual:bunwire/registry`. The Vite hooks resolve only the canonical registry ID, cache one analysis per build, and invalidate it at the next build start. The generated module exports `applicationRegistry` and a default registry value suitable for `Application.withRuntimeRegistry()`.
