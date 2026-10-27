# `@bunwire/vite` 0.1.0

`@bunwire/vite` provides Bunwire's bounded discovery, TypeScript analysis, deterministic registry/client generation, and Vite virtual-module layer.

For Node tooling without Vite installed, import `generateBunwireArtifacts()` and the compiler diagnostics from the public `@bunwire/vite/compiler` subpath. The package's `vite` peer is optional for this use; the `bunwire()` Vite plugin still requires Vite in applications that use it. The `@bunwire/cli` executable calls this compiler boundary for `bunwire generate`.

The compiler subpath also exposes Vite-independent watch-input and missing-import recovery helpers. Both the Vite plugin and `bunwire watch` use these helpers; each host owns its own filesystem watcher and reporting lifecycle. Standalone watch runs on Node without importing a Vite server.

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

Milestone 16 integrates this internal foundation into registered decorator and parameter-injector options, class attachments, compiled protected fields, Event aliases, middleware aliases/filters, and individual string-valued @Use() arguments. Existing validators still enforce the resolved values. Class/token arguments retain canonical identity handling rather than becoming data. Each analysis uses one shared session; final mutation checks permit exact canonical decorator consumption sites while rejecting arbitrary calls and writes to consumed properties. Milestone 17 also applies this session to central middleware and schedule values. Milestone 18 adds static policy helpers, Milestone 19 composes repeated blocks, and Milestone 20 expands bounded static `for...of` loops. Milestone 21 exposes consumed project-local dependency files on analysis and manual-generation results and watches them in Vite development. Config parsing, adapter discovery, and bootstrap recognition do not use the resolver.

## Generated registry module

### Static composition syntax at the Milestone 22 checkpoint

| Accepted in managed metadata or policy bodies | Rejected during analysis |
|---|---|
| Project-local `const` values, imports, aliases, namespace members, and re-exports | Runtime variables, ambient/type-only values, dependency-package helper bodies, and dynamic imports |
| Literal arrays/objects, spreads, known own properties, computed string/number keys, and finite arithmetic | Getters, prototype lookup, holes, implicit coercion, arbitrary calls, environment reads, and non-finite results |
| Canonical managed class/token references where the consuming API permits them | Name-matching strings, plain classes, counterfeit decorators, and unsupported targets |
| Synchronous typed helpers with identifier parameters, block bodies, local `const`, and direct nested calls | Recursive, async/generator, value-returning, destructured/default/rest parameter, or registry-escaping helpers |
| Repeated `withMiddlewares()`/`withSchedule()` calls and `for (const item of knownArray) { ... }` | General `for`/`while`/`for await`, runtime iterables, conditionals, assignment, and optional/computed policy calls |

For example, replace repeated inline middleware calls with a project-local helper and a known collection:

```ts
// billing-policy.ts
import type { MiddlewarePolicyRegistry } from "@bunwire/core";
export const SECURITY = ["billing-auth", "billing-audit:strict"] as const;
export function addBilling(registry: MiddlewarePolicyRegistry) {
  for (const middleware of SECURITY) { registry.use(middleware); }
}

// bootstrap.ts — composition only; the host entrypoint calls app.start()
import { defineApp } from "@bunwire/core";
import { BunAdapter } from "@bunwire/bun";
import { addBilling } from "./billing-policy.js";
export default defineApp()
  .withAdapter(new BunAdapter({ role: "http" }))
  .withMiddlewares(addBilling);
```

Use an explicit runtime token for arbitrary values or interfaces; static resolution of a value does not register a container binding. For jobs, move fixed queue/retry/timeout values to project-local exported `const` declarations and import them into protected metadata fields. Move fixed schedule declarations into typed helpers called from `withSchedule()`; keep runtime decisions inside ordinary application code instead of trying to run them in a compile-only callback.

The source boundary is the canonical project root. Imported local files outside managed discovery roots may supply values and helpers but do not contribute managed classes. Analysis rejects detected mutation within its TypeScript graph and emits a snapshot; `const` and `as const` do not freeze runtime objects. Fixed per-compilation budgets are 64 levels, 100,000 evaluated nodes, and 10,000 emitted policy declarations, with repeated work charged. Unsupported syntax fails compilation without executing application modules or policy callbacks.

Supplementary adapter class decorators use Core's generic `classAttachments` compiler contributions. Vite resolves their exact canonical symbols (including re-exports), accepts supported static factory metadata on declared allowed managed kinds, and rejects duplicate, misplaced, inherited or counterfeit attachments. It emits frozen `defineManagedClassAttachment()` sidecar records without replacing canonical owning class/Event/Listener entries. `ManagedClassIdentityHandlerData` (`bunwire.managed-class-identity`) can validate a shared identity namespace across selected class kinds and supplementary metadata; callbacks receive compiler data only. An unrelated fake-adapter fixture verifies these extension points without platform-specific names or branches.

`generateRuntimeRegistryModule()` converts the completed analysis into deterministic TypeScript containing class metadata, constructor dependencies, Providers, managed-method plans, resolver IDs, adapter metadata, attachment-only middleware arrays, and optional platform-neutral schedule records. Middleware entries use `defineMiddlewareAttachment()` with a canonical class import plus immutable parameters; schedule entries use `defineRuntimeSchedule()` with a canonical managed target and static data. Functions, aliases, groups, mappings, and source syntax never reach runtime. Imports and records are sorted independently of filesystem enumeration order, and `BUNWIRE_REGISTRY_HASH` identifies the byte-stable generated body.

Optional direct `Application.withMiddlewares((registry) => { ... })` blocks are parsed from the same exported `defineApp()` chain used for adapter discovery. Each is a static compiler DSL: the callback must be synchronous and have a block body. It may contain local `const` values and calls to supported typed helpers, including imported functions and a directly named callback. Reached helpers expand direct `registry.use()`, `registry.group()`, and `registry.controllers()` calls in chain and statement order. Groups from all blocks are collected before references resolve, so forward references work across blocks; duplicate names and cycles remain errors. Global and Controller mapping attachments preserve their declaration order, then the usual layer precedence and canonical deduplication apply. Their arguments support the shared static expression language: imported arrays, mixed canonical class/alias entries, array spreads, group names, object spreads, and computed mapping keys. Known argument spreads expand before arity validation; an unspread array is not flattened into positional arguments. Analysis never imports the bootstrap or invokes the callbacks.

`Application.withSchedule((schedule) => { ... })` follows the same repeatable compile-only rule. A typed helper such as `registerBillingSchedules(schedule, "daily")` may own static job/task declarations in another project-local file, and a supported named helper may be passed directly as the callback. All declarations compose in chain and statement order. A generic adapter metadata handler declares allowed job/task class kinds and interprets the analyzed fluent calls; Vite contains no Bun cron or queue branches. Targets must resolve to canonical generated classes, job arguments and cadence/modifier inputs must resolve through the shared static expression language, caller arity is checked against the generated intrinsic `handle()` plan, and duplicate schedule IDs across all blocks fail compilation. Server-only scheduled methods carry the generic no-caller-contract marker, so they do not appear in `virtual:bunwire/client`.

Invalid resolved values and mapping keys retain their originating source locations, including imported declarations. Schedule adapters may attach an optional standard `Error.cause` of `{ value: input.calls[n] | input.arguments, index?: number }` to validator errors. The compiler maps that exact supplied record/array identity back to an argument origin (or the whole call when index is omitted); untagged errors retain the statement location. This convention keeps adapter validation semantics outside the generic compiler.

Policy callbacks/helpers accept local `const` declarations, plain identifier parameters, synchronous block-bodied function declarations or `const` functions, and nested direct helper calls. The compiler follows TypeScript symbols through aliases and re-exports, binds registry capabilities and static arguments lexically, and expands each reached call without executing application modules. Recursion, dynamic factories, registry escape, assignments, unsupported statements, optional/computed calls, and general JavaScript control flow remain rejected. A synchronous `for (const item of knownArray)` with one identifier and a block body expands in array order in callbacks or reached helpers; each iteration has its own lexical binding and shares the fixed depth, node, and declaration budgets. Helper errors retain both definition and call locations. Only exact Core policy registry/builder method symbols are additionally treated as safe metadata consumers in mutation checking; counterfeit same-name calls remain errors. Group expansion shares the fixed node/depth budgets, including cached copies; group definitions, schedule entries, and global/mapping attachments before deduplication share the declaration budget across blocks.

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

The Vite plugin generates these artifacts at build start, watches the Bunwire config, bootstrap, source roots, page root/entry, discovered files, and consumed project-local imports and re-export intermediates, and ignores its own outputs. Imported dependencies outside managed roots trigger reanalysis without expanding class discovery. After a successful analysis, the relevant dependency set is replaced; deletion errors retain recovery watch coverage and surface through Vite rather than presenting stale virtual metadata as a successful refresh. A failed refresh also watches unresolved project-local import candidates, so creating a newly imported helper can recover without another source edit. Page edits and additions invalidate `virtual:bunwire/pages` for development HMR. Production builds emit `bunwire-pages.json` and replace the server page artifact with the exact hashed entry, CSS, asset list, and deterministic version. Generated asset roots are relative to the application root, so start the built host with the application directory as its working directory. Manual generation reports the same consumed dependencies and avoids rewriting byte-identical outputs. `BunwireCompilerError` preserves its code and primary `location` and may include `related` labeled source locations for reference, helper, and loop paths.
