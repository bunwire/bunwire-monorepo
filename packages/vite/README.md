# `@bunwire/vite` 0.1.0

`@bunwire/vite` provides Bunwire's bounded discovery, TypeScript analysis, deterministic registry/client generation, and Vite virtual-module layer.

## Configuration

Place one `bunwire.config.*` file at the project root:

```ts
import { defineBunwireConfig } from "@bunwire/vite";

export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./src/bun/bootstrap.ts",
  pages: {
    root: "./src/pages",
    entry: "./src/client.tsx",
  },
});
```

`source`, `bootstrap`, and optional page root/entry paths are literal and project-root-relative. `source` may also be an array. Page configuration accepts an HTTP(S) development origin and unique dot-prefixed extensions. Config loading is declarative: the loader parses this object rather than importing and executing the config module. Missing, malformed, ambiguous, absolute, and project-escaping paths produce typed `BunwireCompilerError` diagnostics.

## Discovery

`loadBunwireConfig()` resolves and contains the configured paths. `discoverBunwireSourceFiles()` returns a frozen, deterministically sorted list of JavaScript/TypeScript source files, excluding declaration files and anything outside the configured roots. Canonical directories are visited once, so contained filesystem aliases and cycles terminate; broken or inaccessible links produce typed diagnostics. `discoverBunwireApplication()` combines that graph with bootstrap adapter discovery and compiler-extension aggregation.

The bootstrap must export a composition rooted at a statically imported `defineApp()` and configure exactly one primary adapter with a direct expression such as:

```ts
export default defineApp().withAdapter(new HostAdapter({ /* runtime options */ }));
```

Discovery follows only the receiver-call chain of that default export. Adapter-like calls in unused functions, dormant branches, callbacks, constructor arguments, or unrelated expressions do not participate. It resolves the imported adapter class and reads its own static `compiler` data property. Package exports use ESM-compatible `node`, `import`, and `default` conditions in declaration order; a `require` condition cannot silently select different compiler metadata. Discovery does not import the bootstrap, construct the adapter, evaluate constructor arguments, invoke configuration callbacks, or start the Application. Loading the selected adapter's compiled JavaScript module performs normal module initialization, so compiler descriptors must remain declarative and side-effect-free.

Compiler-extension aggregation seeds Core's canonical built-in class kinds, validates adapter class/method/decorator ownership, and rejects conflicting IDs or compiler-symbol assignments. Each registered decorator/injector definition names its canonical public module export through `compilerSymbol`; analysis resolves that export inside the Program and compares exact TypeScript symbols after following aliases and re-exports. A different symbol cannot gain authority by copying a registered ID. The `virtual:bunwire/*` namespace is reserved for Bunwire's generated modules.

## Symbol and parameter analysis

`createBunwireProgram()` creates one TypeScript `Program` and checker over the configured source universe. `analyzeBunwireProgram()` reuses that context to resolve decorator/type aliases by symbol, discover canonical managed class kinds, compile indexed constructor dependencies, and compile every managed-method parameter.

`analyzeBunwireApplication()` is the integrated entrypoint: it runs Milestone 7 configuration/source/adapter discovery and returns that result together with the Milestones 8–9 analysis.

Constructor parameters must use explicit `@Inject(TOKEN)` or resolve to a managed class kind with `injectable: true`; plain classes, invalid runtime-token values, `any`, `unknown`, and erased interfaces produce source-located diagnostics. A managed subclass may use an implicit constructor only when its effective constructor has no parameters; otherwise it must declare an explicit forwarding constructor. Statically known managed-class dependency cycles fail at compile time with their cycle path.

Managed methods classify registered parameter injectors first, explicit `@Inject()` second, injectable managed types third, and every remaining parameter as caller-visible transport input. Each method result preserves true `methodIndex` values independently from compact `argumentIndex` values, including optional and final-rest semantics plus minimum/maximum caller bounds. Managed methods must be concrete instance methods; static, abstract, and declaration-only methods are rejected before registry generation.

The canonical `@Use()` symbol is analyzed separately from managed-method decorators. It is valid on canonical Controllers and their concrete managed methods. Arguments must be discovered middleware classes or supported static alias string expressions; same-ID counterfeit symbols, functions, unsupported placements, dynamic expressions, and invalid targets fail with source-located diagnostics.

Alias strings split at the first `:`, then split parameters on `,`. Names and parameters are trimmed, empty entries and attempted delimiter escaping are rejected, and values receive no coercion. Class references cannot carry inline parameters. Controller decorators retain top-to-bottom and argument left-to-right order, followed by method decorators in the same order; exact duplicates remain until centralized normalization in Milestone 12D.

Canonical `@Middleware()` classes are discovered as the built-in `core.middleware` managed kind. The compiler accepts the canonical export through normal aliases/re-exports and rejects a different symbol claiming its ID. Middleware must be named, directly exported, concrete, and provide or inherit a concrete callable instance `handle(context, next)` method.

Middleware may declare `alias`, `include`, `exclude`, `only`, and `except` as protected non-static instance fields. The compiler reads their syntax without constructing the class: `alias` resolves to a non-empty static string, while filters resolve to arrays of unique non-empty strings. Unsupported dynamic expressions/calls, computed class member names, getters/setters, constructor assignments, missing initializers, invalid visibility/types, and simultaneous `only`/`except` fail with source-located diagnostics. Duplicate aliases are rejected across the complete configured source universe.

Middleware constructor injection and managed dependency-cycle validation reuse the same rules as Services and Controllers. Generated registry modules emit these classes through `defineMiddlewareDefinition()`, which installs immutable metadata, indexed dependencies, and mandatory transient scope through Core's canonical runtime validation boundary. Compiler analysis and generation never import middleware modules or execute field initializers, constructors, or `handle()`.

Compiler runtime references retain the source expression, resolved exported symbol, use location, and declaration location. When application source uses a package import, generated code retains that package's public named alias, default export, or namespace member rather than combining the package specifier with an internal declaration name. Managed classes and runtime tokens must be exported so generated modules can import them. Runtime packages do not scan source or infer signatures. File identity follows the host filesystem: case is folded on case-insensitive hosts and preserved on case-sensitive hosts.

## Internal static expression foundation (Milestone 15)

The compiler includes a directly tested internal resolver for reusable static values. It supports primitive literals; parentheses, assertions, `as const`, and `satisfies`; local/imported `const` initializers; aliases, namespaces, and re-exports; arrays/objects and spreads; string/number computed keys and own-property reads; unary numeric `+`/`-`; finite numeric `+`, `-`, `*`, `/`, `%`, `**`; and string-only `+`. Objects use source-order overwrites and safe own-property storage, including `__proto__`. Missing properties and sparse arrays are errors. Class/token references remain separate canonical compiler symbols rather than serialized names.

Resolution reads available TypeScript source within the canonical project root, including imported local files outside managed discovery roots, without discovering additional classes. It records source origins and all consumed dependency/re-export files. Arbitrary dependency-package initializers, ambient/type-only values, mutable bindings, getters, arbitrary calls, environment reads, implicit coercion, and non-finite arithmetic are unsupported. Existing authorized package class/token references retain their separate canonical authorization path.

One internal session owns fixed limits of 64 recursive resolution levels, 100,000 evaluated nodes, and 10,000 emitted policy declarations. Cached resolution is charged again when reused. Diagnostics identify the unsupported operation and reference path. The resolver never imports application modules or executes their initializers, constructors, helpers, callbacks, or Provider lifecycle code.

Compiled metadata is an initializer snapshot. Checks reject detected writes through consumed bindings, structural/property aliases, and potentially mutating/escaping calls in project-local files already in the Program. Ordinary scalar runtime uses remain valid. This is bounded analysis, not proof that JavaScript objects are frozen: later runtime mutation cannot reconfigure generated metadata.

Milestone 16 integrates this internal foundation into registered decorator and parameter-injector options, class attachments, compiled protected fields, Event aliases, middleware aliases/filters, and individual string-valued @Use() arguments. Existing validators still enforce the resolved values. Class/token arguments retain canonical identity handling rather than becoming data. Each analysis uses one shared session; final mutation checks permit exact canonical decorator consumption sites while rejecting arbitrary calls and writes to consumed properties. Milestone 17 also applies this session to central middleware and schedule values. Helpers, repeated blocks, loops, and complete development dependency invalidation arrive in later milestones. Config parsing, adapter discovery, and bootstrap recognition do not use the resolver.

## Generated registry module

Supplementary adapter class decorators use Core's generic `classAttachments` compiler contributions. Vite resolves their exact canonical symbols (including re-exports), accepts supported static factory metadata on declared allowed managed kinds, and rejects duplicate, misplaced, inherited or counterfeit attachments. It emits frozen `defineManagedClassAttachment()` sidecar records without replacing canonical owning class/Event/Listener entries. `ManagedClassIdentityHandlerData` (`bunwire.managed-class-identity`) can validate a shared identity namespace across selected class kinds and supplementary metadata; callbacks receive compiler data only. An unrelated fake-adapter fixture verifies these extension points without platform-specific names or branches.

`generateRuntimeRegistryModule()` converts the completed analysis into deterministic TypeScript containing class metadata, constructor dependencies, Providers, managed-method plans, resolver IDs, adapter metadata, attachment-only middleware arrays, and optional platform-neutral schedule records. Middleware entries use `defineMiddlewareAttachment()` with a canonical class import plus immutable parameters; schedule entries use `defineRuntimeSchedule()` with a canonical managed target and static data. Functions, aliases, groups, mappings, and source syntax never reach runtime. Imports and records are sorted independently of filesystem enumeration order, and `BUNWIRE_REGISTRY_HASH` identifies the byte-stable generated body.

The optional direct `Application.withMiddlewares((registry) => { ... })` block is parsed from the same exported `defineApp()` chain used for adapter discovery. It is a static compiler DSL: the callback must be synchronous, direct, and contain only direct `registry.use()`, `registry.group()`, and `registry.controllers()` calls. Their arguments support the shared static expression language: imported arrays, mixed canonical class/alias entries, array spreads, group names, object spreads, and computed mapping keys. Known argument spreads expand before arity validation; an unspread array is not flattened into positional arguments. Analysis never imports the bootstrap or invokes the callback.

`Application.withSchedule((schedule) => { ... })` follows the same compile-only rule. A generic adapter metadata handler declares allowed job/task class kinds and interprets the analyzed fluent calls; Vite contains no Bun cron or queue branches. Targets must resolve to canonical generated classes, job arguments and cadence/modifier inputs must resolve through the shared static expression language, caller arity is checked against the generated intrinsic `handle()` plan, and duplicate schedule IDs fail compilation. Server-only scheduled methods carry the generic no-caller-contract marker, so they do not appear in `virtual:bunwire/client`.

Invalid resolved values and mapping keys retain their originating source locations, including imported declarations. Schedule adapters may attach an optional standard `Error.cause` of `{ value: input.calls[n] | input.arguments, index?: number }` to validator errors. The compiler maps that exact supplied record/array identity back to an argument origin (or the whole call when index is omitted); untagged errors retain the statement location. This convention keeps adapter validation semantics outside the generic compiler.

Policy callbacks still reject local declarations, helpers, loops, optional/computed calls, and multiple blocks. Group expansion shares the fixed node/depth budgets, including cached copies; group definitions, schedule entries, and global/mapping attachments before deduplication share the declaration budget.

Intrinsic managed methods may also declare an exact resolver-ID allowlist. Vite then accepts only canonical parameter injectors resolving through that list and emits their immutable metadata in the normal managed-method plan. Bun commands use this generic contract for arguments/options/flags; Vite contains no CLI parsing or Bun command-name branches.

Groups are collected before expansion, so forward and nested references are valid; duplicate names, alias collisions, parameterized groups, unknown references, and complete direct/indirect cycles fail with source-located diagnostics. Controller mappings use case-sensitive configured-source-root-relative POSIX paths with segment `*` and cross-segment `**`. Invalid, traversing, absolute, backslash, and unmatched patterns fail compilation.

Each analyzed managed method carries its final pipeline in global → matching Controller mappings → Controller `@Use()` → method `@Use()` order. Canonical attachments are deduplicated by target identity plus exact ordered parameters while the earliest entry wins; distinct parameterizations remain ordered. Generation emits only canonical attachments—never functions, policy groups, aliases, patterns, or runtime matching data.

`bunwire()` exposes that same output through `virtual:bunwire/registry`. The generated module exports `applicationRegistry` and a default registry value suitable for `Application.withRuntimeRegistry()`.

## Generated caller module

`generateCallerContractModule()` reads only caller-classified parameters from the same analysis used for registry plans. It preserves `argumentIndex` order, required/defaulted/optional/rest positions, array-valued argument types, and request return types by referencing the original exported Controller method type at its analyzed `methodIndex`. Adapter compiler metadata supplies endpoint naming, request/message mode, the client factory, and the native schema adapter; Vite contains no Electrobun IDs or transport encoding.

`bunwire()` exposes this module as `virtual:bunwire/client`. It exports `createBunwireClient(transport)`, `BunwireClient`, request/message contract maps, and `BunwireClientSchema`. The returned client accepts logical positional arguments. Adapter-native payload encoding is absent from the generated source and remains owned by the adapter factory.

## Generated artifacts and development lifecycle

`generateBunwireArtifacts()` is the shared manual/non-Vite generation boundary. By default it writes `.bunwire/registry.ts`, `.bunwire/client.ts`, and `.bunwire/virtual-modules.d.ts`; page-enabled applications also receive `.bunwire/pages.ts`. Custom output paths are supported. It returns the generated hashes, resolved output paths, and only the paths whose bytes changed. Existing files are not rewritten when output is identical.

The declaration artifact gives editors and `tsc` exact application-specific types for `virtual:bunwire/registry`, `virtual:bunwire/client`, and configured `virtual:bunwire/pages`. The page module maps stable root-relative component names to lazy imports. Include `.bunwire/**/*.ts` in the application's TypeScript project. Physical generated files remain the manual/non-Vite escape hatch.

The Vite plugin generates these artifacts at build start, watches the Bunwire config, bootstrap, source roots, page root/entry, and discovered files, and ignores its own outputs. Page edits and additions invalidate `virtual:bunwire/pages` for development HMR. Production builds emit `bunwire-pages.json` and replace the server page artifact with the exact hashed entry, CSS, asset list, and deterministic version. Generated asset roots are relative to the application root, so start the built host with the application directory as its working directory. Invalid changed source surfaces the typed compiler diagnostic instead of serving stale metadata.
