# Bunwire Implementation Milestones

> Implementation plan for **TypeScript Application Framework — Architecture Specification v0.4**.

## Purpose

This file breaks the architecture into dependency-aware implementation phases. Each milestone contains:

- goal;
- implementation scope;
- concrete steps;
- required tests;
- exit criteria.

The intended sequence is:

```text
0. Repository foundation
        ↓
1. Managed-class metadata + decorator definitions
        ↓
2. Container, bindings, tokens, scopes
        ↓
3. Service / Controller / Provider core kinds
        ↓
4. Application builder + Provider lifecycle + kernel
        ↓
5. Generic managed-method + invocation API
        ↓
6. Class-based adapter + extension API
        ↓
7. bunwire.config + Vite source discovery
        ↓
8. TypeScript symbol analysis + constructor DI
        ↓
9. Managed-method parameter plans + validation
        ↓
10. Generated registries + runtime execution
        ↓
11. Electrobun adapter
        ↓
12. Generated RPC contracts + end-to-end application
        ↓
13. Hardening + first release
```

---

# Architectural Gates

These rules apply to every milestone.

1. `core` never imports Vite.
2. `core` never imports Electrobun.
3. Electrobun-specific concepts never become Core requirements.
4. Outer/class decorators opt classes into Bunwire's managed graph.
5. Automatic type-based DI only targets managed class kinds explicitly marked `injectable`.
6. Plain classes do not become automatically injectable merely because TypeScript can find them.
7. A plain class may be container-injected through explicit `@Inject(Class)` and a runtime binding.
8. Interfaces, arbitrary objects, values, and erased TypeScript types use explicit runtime tokens.
9. Services are not Providers.
10. Container registrations are called bindings, not Providers.
11. `defineApp()` creates an instantiated Application; it does not start it.
12. `app.start()` is the normal public startup boundary.
13. Runtime adapters are class instances attached to that Application before startup.
14. A full adapter may own the normal platform bootstrap and native host configuration.
15. `withContext()` is the explicit/manual host integration path, not the recommended default for a full adapter.
16. Host/adapter context is stored in the root container before Provider registration that depends on it.
17. Provider `register(container)` runs once during application startup.
18. Provider `boot(context)` runs per managed invocation.
19. `register()` is framework-owned and receives the container, not inferred method DI parameters.
20. Runtime does not rescan the source tree.
21. Vite compiles method parameter classification once.
22. Every managed method parameter retains its true method index.
23. Caller-visible arguments receive a separate generated argument index.
24. Injected/server-side parameters never appear in generated caller-facing contracts.
25. Ordinary caller arguments do not require `@Arg(index)`.
26. Parameter injector decorators select framework/adapter resolution sources; they do not repeat indexes.
27. Core exposes generic managed-class, managed-method, and parameter-injector extension APIs.
28. Adapters can add controller-like class kinds, route-like method kinds, parameter injectors, and adapter-owned Providers without Core/Vite changes.
29. Vite must not hard-code every adapter decorator.
30. Provider binding code does not need to be executed by Vite for the basic compiler/runtime model to work.
31. Runtime container resolution remains authoritative for dynamic Provider bindings.
32. Explicit developer bindings deterministically override convention defaults.
33. Platform-native objects remain platform-native even if a full adapter creates/configures them.
34. Controllers expose only recognized managed/invocable methods.
35. Request and message semantics remain distinct.
36. Generated registries/contracts are compiler output and require no manual maintenance.
37. Runtime adapter configuration belongs in `bootstrap.ts`; `bunwire.config.*` must not require duplicating the same adapter instance configuration.
38. `app.stop()` is the terminal public shutdown boundary; adapter cleanup remains Core-orchestrated rather than runtime-package-specific.

## Required test layers

Every test checklist item is explicitly classified. All milestone tests are automated unless a future item is explicitly marked `Manual`.

Use these classifications consistently:

- **Automated / Unit** — isolated descriptors, metadata, tokens, configuration objects, or small APIs.
- **Automated / Behavioral** — observable public/runtime behavior exercised through the relevant API without requiring the full system.
- **Automated / Compiler Fixture** — real TypeScript fixture projects analyzed or compiled through Bunwire's compiler/Vite tooling.
- **Automated / Integration** — multiple Bunwire subsystems or packages working together, such as generated metadata + Core runtime + fake adapters.
- **Automated / E2E** — full application/host behavior through the real adapter-facing application flow.
- **Automated / Type-level** — compile-success/compile-failure assertions for TypeScript-facing contracts.
- **Automated / Architecture** — package dependency, source-boundary, platform-leakage, or forbidden-import invariants.
- **Automated / Build** — clean install, workspace/package build, typecheck, and root command verification.
- **Automated / Generated Output** — deterministic/stable generated artifacts or metadata output.

`Behavioral` does not mean manual: it is still an automated test, but it asserts externally observable behavior rather than internal structure.

---

# Milestone 0 — Monorepo and Quality Foundation

## Goal

Create package boundaries and development infrastructure before framework behavior exists.

## Deliverables

```text
packages/
├── core/
├── vite/
└── electrobun/

examples/
└── electrobun-app/
```

Add:

- workspace configuration;
- shared TypeScript configuration;
- package entrypoints/exports;
- test runner configuration;
- typecheck/build commands;
- fixture-project test infrastructure;
- package-boundary architecture checks;
- CI quality command.

## Implementation steps

1. Create `core`, `vite`, and `electrobun` packages.
2. Establish dependency direction:
   - `core` → no dependency on Vite/Electrobun;
   - `vite` → may depend on compiler contracts from `core`;
   - `electrobun` → may depend on `core` and expose compiler/runtime extension pieces.
3. Add workspace typechecking.
4. Add package-level and workspace-level tests.
5. Add fixture-project support for future compiler tests.
6. Add automated forbidden-import checks.

## Tests

- [ ] **[Automated / Architecture]** `core` builds without Vite installed as a runtime dependency.
- [ ] **[Automated / Architecture]** `core` builds without Electrobun installed as a runtime dependency.
- [ ] **[Automated / Architecture]** A deliberate `core -> vite` import fails the architecture test.
- [ ] **[Automated / Architecture]** A deliberate `core -> electrobun` import fails the architecture test.
- [ ] **[Automated / Build]** Workspace typecheck succeeds from a clean install.
- [ ] **[Automated / Build]** Workspace tests run from the root.
- [ ] **[Automated / Build]** Packages build independently.

## Exit criteria

Package boundaries are mechanically enforced before framework implementation starts.

---

# Milestone 1 — Managed-Class Metadata and Decorator Definitions

## Goal

Define the generic language used to describe outer/class decorators and managed class kinds.

## Deliverables

Core types for:

- `ManagedClassKind`;
- decorator IDs;
- class-kind IDs;
- `injectable` capability;
- `autoDiscover` capability;
- constructor-analysis capability;
- managed-method capability;
- registry capability;
- class metadata;
- source-independent runtime metadata shape.

Conceptual API:

```ts
defineClassKind({
  id: "core.service",
  injectable: true,
  autoDiscover: true,
  analyzeConstructor: true,
  managedMethods: false,
});
```

## Implementation steps

1. Define stable class-kind identifiers.
2. Define a generic managed-class descriptor.
3. Separate decorator declaration from platform/runtime meaning.
4. Define metadata needed by build tooling without importing Vite.
5. Define decorator helper APIs used by Core and adapters.
6. Ensure extensions can register new class kinds without modifying a central enum.

## Tests

- [ ] **[Automated / Unit]** Two class kinds can coexist without hard-coded enum changes.
- [ ] **[Automated / Unit]** Class-kind IDs are stable and namespaced.
- [ ] **[Automated / Unit]** `injectable` is independently configurable from `managedMethods`.
- [ ] **[Automated / Unit]** A class kind can be registry-managed but not method-managed.
- [ ] **[Automated / Compiler Fixture]** Adapter-created class descriptors compile using only Core APIs.
- [ ] **[Automated / Architecture]** Core contains no adapter-specific class-kind IDs.

## Exit criteria

Core can represent Service-like, Controller-like, Provider-like, and future adapter-defined managed classes using one generic model.

---

# Milestone 2 — Container, Bindings, Tokens, and Scopes

## Goal

Implement runtime DI independently from Vite and platform adapters.

## Deliverables

Container support for:

- class bindings;
- singleton bindings;
- transient bindings;
- value bindings;
- factory bindings;
- aliases;
- existing instances;
- custom tokens;
- class tokens;
- recursive constructor resolution from supplied metadata;
- useful resolution errors.

Suggested vocabulary:

```ts
container.bind(...)
container.singleton(...)
container.transient(...)
container.value(...)
container.factory(...)
container.alias(...)
container.get(...)
```

Do not call these binding definitions “Providers.”

## Implementation steps

1. Implement `createToken<T>()`.
2. Define class/token identity model.
3. Implement binding storage.
4. Implement class resolution from indexed dependency metadata.
5. Implement singleton caching per root/container scope.
6. Implement transient resolution.
7. Implement values/factories/aliases.
8. Implement runtime circular-resolution protection.
9. Define explicit override semantics.

## Tests

### Tokens

- [ ] **[Automated / Unit]** Custom tokens are unique even with equal descriptions.
- [ ] **[Automated / Unit]** Class constructors can act as runtime tokens.
- [ ] **[Automated / Type-level]** Interface-only TypeScript types cannot accidentally become runtime tokens.

### Class resolution

- [ ] **[Automated / Behavioral]** Zero-argument class resolves.
- [ ] **[Automated / Behavioral]** Constructor dependency index `0` resolves correctly.
- [ ] **[Automated / Behavioral]** Multiple constructor dependencies preserve positions.
- [ ] **[Automated / Behavioral]** Dependency metadata supplied out of order still creates correctly ordered constructor arguments.

### Scopes

- [ ] **[Automated / Behavioral]** Singleton resolves to the same instance in one application container.
- [ ] **[Automated / Behavioral]** Separate root containers do not share singleton instances.
- [ ] **[Automated / Behavioral]** Transient produces a new instance per resolution.

### Explicit bindings

- [ ] **[Automated / Behavioral]** Token → value works.
- [ ] **[Automated / Behavioral]** Token → factory works.
- [ ] **[Automated / Behavioral]** Token → class works.
- [ ] **[Automated / Behavioral]** Alias preserves singleton identity.
- [ ] **[Automated / Behavioral]** Missing token produces an actionable error.
- [ ] **[Automated / Behavioral]** Runtime circular dependency produces a useful chain.

## Exit criteria

Given explicit metadata and bindings, Core can construct an object graph correctly without any source analysis.

---

# Milestone 3 — Built-in Service, Controller, and Provider Kinds

## Goal

Implement the first three Core outer decorators as configurations of the generic managed-class model.

## Deliverables

### `@Service()`

Semantics:

```text
autoDiscover      = true
injectable        = true
analyzeConstructor= true
managedMethods    = false
```

Service scope metadata may include `singleton` and `transient`.

### `@Controller()`

Semantics:

```text
autoDiscover      = true
injectable        = true
analyzeConstructor= true
managedMethods    = true
registry          = true
```

Controller prefix/namespace metadata should be represented generically enough for adapters to consume.

### `@Provider()`

Semantics:

```text
autoDiscover      = true
registry          = true
known lifecycle hooks:
  register
  boot
```

Provider lifecycle behavior is implemented in Milestone 4.

## Implementation steps

1. Implement built-in class-kind definitions.
2. Implement `@Service()`.
3. Implement `@Controller()`.
4. Implement `@Provider()`.
5. Ensure all three are emitted through the same managed-class metadata API.
6. Decide and document Provider constructor restrictions for v1. The `register()` method itself never uses normal method-parameter DI.

## Tests

- [ ] **[Automated / Unit]** `@Service()` creates `core.service` metadata.
- [ ] **[Automated / Unit]** `@Controller()` creates `core.controller` metadata.
- [ ] **[Automated / Unit]** `@Provider()` creates `core.provider` metadata.
- [ ] **[Automated / Unit]** Service says `managedMethods=false`.
- [ ] **[Automated / Unit]** Controller says `managedMethods=true`.
- [ ] **[Automated / Unit]** Provider lifecycle metadata identifies `register`/`boot` without pretending they are ordinary routes.
- [ ] **[Automated / Unit]** A plain undecorated class receives none of these managed capabilities.

## Exit criteria

The three built-ins are proven to be specializations of the same Core extension mechanism, not unrelated hard-coded systems.

---

# Milestone 4 — Application Builder, Provider Lifecycle, and Kernel

## Goal

Implement the instantiated application/composition-root model and Provider semantics clarified by the architecture.

## Deliverables

Public application shape:

```ts
const app = defineApp();

app.withContext(context); // manual/escape-hatch path
await app.start();
```

`defineApp()` returns an Application instance immediately. Configuration methods mutate/accumulate application definition while the instance remains unstarted.

Provider contract:

```ts
interface Provider {
  register(container: Container): void | Promise<void>;
  boot?(context: InvocationContext): void | Promise<void>;
}
```

Core startup phases before adapter-specific host behavior is added in Milestone 6:

```text
defineApp()
      ↓
Application exists but is not running
      ↓
optional withContext(context)
      ↓
app.start()
      ↓
create root container
      ↓
load generated/runtime registrations available at this stage
      ↓
store supplied application context in root container
      ↓
load Provider classes
      ↓
Provider.register(rootContainer) — once
      ↓
apply generated/convention bindings with explicit-override semantics
      ↓
application kernel running
```

Invocation phase:

```text
incoming managed invocation
      ↓
create invocation context/scope
      ↓
Provider.boot(context)
      ↓
managed invocation pipeline
```

## Implementation steps

1. Implement `defineApp()` returning an instantiated `Application`.
2. Add a chainable configuration surface suitable for later `withAdapter(...)` integration.
3. Implement `withContext(context)` as an explicit manual-context setter.
4. Make `start()` idempotency/error behavior explicit; starting twice must fail clearly or be safely no-op by contract.
5. Create the root container during `start()`.
6. Store any supplied application/host context in the root container before Provider registration.
7. Implement Provider registry consumption.
8. Instantiate Provider classes according to the v1 Provider-construction rule.
9. Call every Provider's `register()` exactly once.
10. Ensure explicit Provider bindings win over convention defaults.
11. Define `InvocationContext`.
12. Add invocation scope/child-container support where request-local values require it.
13. Call Provider `boot()` before every managed invocation.
14. Ensure concurrent invocations cannot overwrite one another's invocation-scoped values.
15. Add application shutdown/disposal hooks separately from Provider `boot()` semantics if needed.

## Tests

- [ ] **[Automated / Behavioral]** `defineApp()` returns a stable Application object before startup.
- [ ] **[Automated / Behavioral]** Configuration can be chained without starting the application.
- [ ] **[Automated / Behavioral]** `withContext()` stores context for startup without itself starting the app.
- [ ] **[Automated / Behavioral]** `start()` creates the root container once.
- [ ] **[Automated / Behavioral]** Context is container-accessible before Provider `register()` executes.
- [ ] **[Automated / Behavioral]** `register()` runs once across many invocations.
- [ ] **[Automated / Behavioral]** `boot()` runs once for each managed invocation.
- [ ] **[Automated / Integration]** All Provider registrations complete before the runtime accepts managed invocations.
- [ ] **[Automated / Behavioral]** Explicit Provider binding overrides a convention binding.
- [ ] **[Automated / Integration]** Invocation-scoped values do not leak between concurrent invocations.
- [ ] **[Automated / Behavioral]** `register()` receives the root container.
- [ ] **[Automated / Behavioral]** `boot()` receives invocation context rather than a fake application-startup context.
- [ ] **[Automated / Behavioral]** Service classes do not receive Provider lifecycle calls.
- [ ] **[Automated / Behavioral]** Starting the same Application twice follows the documented failure/idempotency rule.

## Exit criteria

The application has a single public startup boundary, Provider and Service semantics are completely separated, and manual host context can be supplied without inventing another Provider lifecycle method.

The later `@bunwire/bun` Milestone 1 extends this completed kernel vertically with terminal `app.stop()`, `stopping`/`stopped` states, exactly-once primary-adapter cleanup, stop-during-start coordination, and startup-failure rollback. It does not add Provider/container disposal or active-invocation draining.

---

# Milestone 5 — Managed Methods, Parameter Sources, and Invocation Engine

## Goal

Create the generic method-level machinery used by routes, messages, jobs, subscribers, and future extension methods.

## Deliverables

Core concepts for:

- `ManagedMethodKind`;
- owning managed-class kind restrictions;
- invocable methods;
- method metadata;
- parameter metadata;
- parameter source kinds;
- parameter injector/resolver IDs;
- middleware attachment points;
- invocation result semantics.

Parameter sources should at least represent:

```text
transport/caller
container
adapter/custom resolver
framework context
```

## Implementation steps

1. Define managed-method kind descriptor.
2. Define relationship between class kind and allowed method kinds.
3. Define real method index metadata.
4. Define caller/transport argument index metadata.
5. Define container-token resolution metadata.
6. Define parameter injector/resolver metadata.
7. Implement generic invocation engine that consumes a prebuilt parameter plan.
8. Implement middleware around generic invocation.
9. Ensure Core invocation does not understand Electrobun.

## Tests

- [ ] **[Automated / Behavioral]** Method parameters can be reconstructed from an arbitrary prebuilt plan.
- [ ] **[Automated / Behavioral]** Method index and caller argument index are independent.
- [ ] **[Automated / Behavioral]** Container parameters may be interleaved with caller arguments.
- [ ] **[Automated / Behavioral]** Parameter-injected values may be interleaved with both.
- [ ] **[Automated / Behavioral]** Caller argument validation supports required/optional parameters.
- [ ] **[Automated / Behavioral]** Unknown injector/resolver IDs fail clearly.
- [ ] **[Automated / Integration]** A fake method kind can invoke a class without platform dependencies.

## Exit criteria

Given generated method metadata, Core can invoke a target method correctly without inferring anything at runtime.

---

# Milestone 6 — Class-Based Adapter and Extension API

## Goal

Make adapters active class-based host integrations with the same structural extension power that makes Controllers and route-like methods work.

## Deliverables

A runtime adapter is a class instance passed to:

```ts
defineApp()
  .withAdapter(new SomeAdapter(config));
```

`withAdapter()` attaches the already-created Application instance to the adapter while the application is still unstarted.

An adapter can contribute:

- managed class kinds;
- managed method kinds;
- parameter injector decorators and runtime resolvers;
- adapter-owned Providers;
- compiler metadata handlers/descriptors;
- runtime registry consumers;
- host preparation/start behavior;
- transports/runtime hooks;
- validation hooks;
- typed native-object configuration callbacks.

The full-adapter lifecycle must support the ordering needed by real hosts:

```text
app.start()
      ↓
create root container / load registry
      ↓
adapter prepares native host objects/context
without accepting managed traffic yet
      ↓
store adapter context in container
      ↓
Provider.register()
      ↓
connect generated managed methods to adapter runtime
      ↓
adapter completes host start / begins accepting traffic
```

The exact internal lifecycle method names are implementation details.

A manual adapter/integration path may instead consume context provided through `app.withContext(...)`.

Example target capability:

```ts
@Consumer()
class OrderConsumer {
  @Subscribe("orders.created")
  handle(
    payload: OrderCreated,
    @Delivery() delivery: DeliveryContext,
  ) {}
}
```

without modifying Core or Vite.

## Implementation steps

1. Define an abstract/base Adapter contract or equivalent class protocol.
2. Implement `Application.withAdapter(adapter)` and attach the Application instance to the adapter.
3. Define one-primary-host-adapter semantics for v1.
4. Define adapter contribution APIs for class kinds, method kinds, parameter injectors, Providers, and runtime consumers.
5. Define compiler-facing extension descriptors that can be resolved from the adapter class/symbol without executing arbitrary instance configuration.
6. Define runtime registry-consumer API.
7. Define namespacing rules for class/method/injector IDs.
8. Define host preparation/context creation and final host-start ordering.
9. Ensure adapter-created context is stored in the root container before Provider registration that needs it.
10. Support adapter-owned Providers in the normal Provider registry/lifecycle.
11. Define typed native-object/configuration callback conventions without wrapping away native objects.
12. Create a fake adapter that defines:
   - one new outer/class decorator;
   - one new managed method decorator;
   - one parameter injector;
   - one adapter-owned Provider;
   - one fake host context;
   - one native-object callback.
13. Ensure generic runtime invocation works for that fake adapter.
14. Prove the manual `withContext()` path works with an already-created fake host.

## Tests

- [ ] **[Automated / Behavioral]** Adapter must be a class instance matching the adapter contract.
- [ ] **[Automated / Behavioral]** `withAdapter()` receives/attaches the same Application instance returned by `defineApp()`.
- [ ] **[Automated / Integration]** Adapter can contribute a Provider before startup.
- [ ] **[Automated / Integration]** Adapter-prepared context is container-accessible during Provider `register()`.
- [ ] **[Automated / Architecture]** Fake adapter adds a new managed class kind without Core changes.
- [ ] **[Automated / Architecture]** Fake adapter adds a managed method kind without Vite changes.
- [ ] **[Automated / Integration]** Fake adapter receives generated metadata for its classes/methods.
- [ ] **[Automated / Integration]** Fake parameter injector participates in invocation and is caller-invisible.
- [ ] **[Automated / Behavioral]** Invalid method decorator placement on the wrong class kind is rejected.
- [ ] **[Automated / Unit]** Injector/class/method IDs are namespaced.
- [ ] **[Automated / Integration]** Fake host does not accept invocations until Providers and registries are ready.
- [ ] **[Automated / Behavioral]** Native callback receives the real fake-host object, not a Bunwire replacement wrapper.
- [ ] **[Automated / Integration]** Manual adapter path can use `withContext(existingContext).start()`.

## Exit criteria

Class-based host ownership, context creation, Provider contribution, parameter injection, and Controller-style extensibility are proven before Electrobun is implemented.

---

# Milestone 7 — `bunwire.config.*` and Vite Source Discovery

## Goal

Give build tooling a bounded application graph and resolve compiler extensions from the application composition root without duplicating runtime adapter configuration.

## Deliverables

Configuration API such as:

```ts
export default defineBunwireConfig({
  source: "./src/bun",
  bootstrap: "./src/bun/bootstrap.ts",
});
```

Runtime adapter configuration remains in `bootstrap.ts`:

```ts
export default defineApp()
  .withAdapter(new ElectrobunAdapter({ /* runtime config */ }));
```

Vite discovery should:

- load Bunwire build config;
- resolve source root(s);
- resolve the composition/bootstrap source;
- discover TypeScript source files;
- analyze `withAdapter(...)` calls in the bootstrap graph;
- resolve the referenced adapter class symbols/modules;
- load compiler descriptors declared by those adapter classes/packages without executing arbitrary runtime instance configuration;
- load registered class/method/parameter-injector definitions;
- avoid runtime filesystem discovery.

## Implementation steps

1. Implement config loader.
2. Resolve source/bootstrap paths relative to project root.
3. Create source-file discovery.
4. Support include/exclude patterns if necessary.
5. Load Core class/method/injector definitions.
6. Analyze the bootstrap composition root for `withAdapter(...)` adapter class references.
7. Resolve adapter compiler descriptors from those symbols/modules.
8. Reject or diagnose adapter expressions that cannot be resolved deterministically enough for compiler integration.
9. Establish a virtual/generated module namespace.
10. Add development diagnostics for malformed config/bootstrap integration.
11. Ensure adapter runtime constructor callbacks/config objects are not executed by the compiler merely to discover adapter capabilities.

## Tests

- [ ] **[Automated / Compiler Fixture]** Relative source root resolves correctly.
- [ ] **[Automated / Compiler Fixture]** Relative bootstrap path resolves correctly.
- [ ] **[Automated / Compiler Fixture]** Multiple source files are discovered deterministically.
- [ ] **[Automated / Compiler Fixture]** Files outside configured source graph are ignored unless explicitly imported/allowed by compiler rules.
- [ ] **[Automated / Compiler Fixture]** Adapter compiler extensions are resolved from the adapter class used in bootstrap.
- [ ] **[Automated / Compiler Fixture]** Adapter runtime configuration does not need to be duplicated in `bunwire.config.*`.
- [ ] **[Automated / Compiler Fixture]** Compiler discovery does not execute native-object callbacks or arbitrary adapter runtime config.
- [ ] **[Automated / Compiler Fixture]** Invalid source root produces an actionable error.
- [ ] **[Automated / Compiler Fixture]** Unresolvable adapter compiler integration produces an actionable error.
- [ ] **[Automated / Architecture]** Runtime code has no source-tree scanning dependency.

## Exit criteria

Vite knows exactly which source graph, composition root, adapter class definitions, and extension descriptors it is responsible for compiling, with runtime adapter configuration declared only once.

---

# Milestone 8 — TypeScript Symbol Analysis and Constructor DI

## Goal

Use the TypeScript compiler API to identify managed classes and compile constructor dependency metadata.

## Deliverables

Analyzer support for:

- outer/class decorator identity by resolved symbol;
- class-kind lookup;
- constructor parameter enumeration;
- concrete managed class type resolution;
- explicit `@Inject(TOKEN)` extraction;
- import aliases;
- cross-file symbols;
- source locations;
- optional constructor parameters if supported.

Automatic constructor rule:

```text
@Inject(TOKEN)?
    → container(TOKEN)

otherwise concrete type belongs to injectable managed class kind?
    → container(Class)

otherwise
    → compile diagnostic requiring explicit injection/binding semantics
```

## Implementation steps

1. Build a TypeScript `Program` for the configured source graph.
2. Resolve decorator symbols rather than matching names only.
3. Discover `@Service`, `@Controller`, `@Provider`, and extension class kinds.
4. Analyze constructors of kinds with `analyzeConstructor=true`.
5. Resolve managed class dependencies by symbol.
6. Extract explicit token expressions from `@Inject()`.
7. Generate indexed constructor dependency metadata.
8. Add diagnostics for impossible automatic constructor injection.

## Tests

- [ ] **[Automated / Compiler Fixture]** Aliased import of `@Service()` is still recognized by symbol.
- [ ] **[Automated / Compiler Fixture]** Imported managed class constructor dependency is auto-injected.
- [ ] **[Automated / Compiler Fixture]** Plain undecorated class constructor dependency is not silently auto-injected.
- [ ] **[Automated / Compiler Fixture]** `@Inject(RandomUtility)` compiles as an explicit container source.
- [ ] **[Automated / Compiler Fixture]** `@Inject(CACHE)` works with an interface-typed parameter.
- [ ] **[Automated / Compiler Fixture]** Interface parameter without `@Inject()` fails with a useful diagnostic.
- [ ] **[Automated / Compiler Fixture]** Constructor parameter positions are preserved.
- [ ] **[Automated / Compiler Fixture]** Cross-file and aliased class symbols resolve correctly.

## Exit criteria

Constructor DI policy is enforced at build time and emitted as runtime-ready metadata.

---

# Milestone 9 — Managed-Method Parameter Plans and Compiler Validation

## Goal

Compile every parameter of every managed/invocable method into a complete runtime execution plan.

## Core rule

For each managed method parameter:

```text
registered parameter injector decorator?
    → injector(resolverId)

@Inject(TOKEN)?
    → container(TOKEN)

concrete type belongs to injectable managed class kind?
    → container(Class)

otherwise
    → caller/transport argument
```

The compiler assigns:

- true method `index` to every parameter;
- sequential `argumentIndex` only to caller-visible parameters.

## Example fixture

```ts
@Route("get")
get(
  id: string,
  users: UserService,
  name: string,
  @Inject(CACHE) cache: Cache,
  @Window() window: BrowserWindow,
  active?: boolean,
) {}
```

Expected plan:

```text
method 0 ← caller arg 0
method 1 ← container(UserService)
method 2 ← caller arg 1
method 3 ← container(CACHE)
method 4 ← electrobun.window
method 5 ← caller arg 2 optional
```

## Implementation steps

1. Enumerate every managed method parameter.
2. Preserve TypeScript source order as method indexes.
3. Apply registered parameter-injector classification first.
4. Apply explicit `@Inject()` second.
5. Apply managed-class auto-DI third.
6. Treat remaining parameters as caller-visible.
7. Assign compact caller argument indexes.
8. Record required/optional/rest semantics.
9. Generate min/max caller argument validation data.
10. Validate method decorators against allowed owning class kinds.
11. Remove `@Arg(index)` from the required Electrobun developer model.

## Tests

### Indexing

- [ ] **[Automated / Compiler Fixture]** No-injection method maps method indexes 0..N directly to caller args 0..N.
- [ ] **[Automated / Compiler Fixture]** One injected parameter in the middle compacts caller indexes correctly.
- [ ] **[Automated / Compiler Fixture]** Multiple interleaved injections compact correctly.
- [ ] **[Automated / Compiler Fixture]** Explicit token injection is excluded from caller args.
- [ ] **[Automated / Compiler Fixture]** Adapter/framework injector parameters are excluded from caller args.
- [ ] **[Automated / Compiler Fixture]** Optional caller parameters preserve optionality.

### Classification

- [ ] **[Automated / Compiler Fixture]** Managed injectable class type auto-injects.
- [ ] **[Automated / Compiler Fixture]** Plain DTO/class type remains caller-visible unless explicitly injected.
- [ ] **[Automated / Compiler Fixture]** Interface with `@Inject(TOKEN)` becomes container-resolved.
- [ ] **[Automated / Compiler Fixture]** Parameter injector decorator wins over type-based classification.

### Validation

- [ ] **[Automated / Behavioral]** Too few caller args fails at runtime using generated bounds.
- [ ] **[Automated / Behavioral]** Too many caller args fails at runtime unless rest args are supported.
- [ ] **[Automated / Compiler Fixture]** Invalid method decorator placement fails at compile time.
- [ ] **[Automated / Compiler Fixture]** Duplicate incompatible parameter-injector/source decorators fail clearly.

## Exit criteria

The compiler can produce a complete parameter plan such that runtime needs zero signature inference.

---

# Milestone 10 — Generated Registries and Runtime Execution

## Goal

Connect compile-time analysis to runtime without filesystem scanning or repeated parameter classification.

## Deliverables

Generated modules for:

- managed class registry;
- Service metadata;
- Controller metadata;
- Provider registry;
- adapter-defined managed class registries;
- managed method metadata;
- constructor dependency plans;
- method parameter plans;
- middleware metadata;
- stable parameter injector/resolver IDs.

Runtime should load generated modules and execute them directly.

## Implementation steps

1. Define generated registry contract.
2. Generate deterministic imports.
3. Generate class metadata by class-kind ID.
4. Generate Provider class registry.
5. Generate constructor dependencies.
6. Generate managed method metadata and parameter plans.
7. Split adapter-owned metadata where useful.
8. Add Vite virtual-module integration.
9. Connect registry to application kernel.
10. Ensure Provider `register()` remains runtime configuration rather than compiler execution.
11. Add deterministic output formatting/hashing.

## Tests

- [ ] **[Automated / Compiler Fixture]** Generated TypeScript typechecks.
- [ ] **[Automated / Generated Output]** Same source produces byte-stable/deterministic registry output where practical.
- [ ] **[Automated / Architecture]** Runtime performs no source-tree scanning.
- [ ] **[Automated / Integration]** Generated constructor plan constructs a Controller correctly.
- [ ] **[Automated / Integration]** Generated managed-method plan handles interleaved caller/container/resolver parameters.
- [ ] **[Automated / Integration]** Provider registry causes `register()` once and `boot()` per invocation.
- [ ] **[Automated / Integration]** Fake adapter class/method registry executes end to end.
- [ ] **[Automated / Integration]** Missing runtime token binding fails through normal container resolution.

## Exit criteria

A platform-independent fixture application is compiled once and runs entirely from generated registries plus runtime container bindings.

---

# Milestone 11 — Electrobun Adapter

## Goal

Implement Electrobun as the first full class-based host adapter entirely through generic Core/compiler extension APIs.

## Deliverables

Primary export:

```ts
new ElectrobunAdapter({
  mainWindow: {
    title: "My App",
    width: 1200,
    height: 800,
    configure(window) {
      // Actual BrowserWindow.
    },
  },
  rpc: {
    configure(rpc) {
      // Actual Electrobun RPC object.
    },
  },
});
```

A manual Electrobun adapter/integration export must also exist for existing or unusually structured Electrobun applications that supply context with `withContext()`.

Electrobun method kinds:

```ts
@Route()
@Message()
```

Electrobun parameter injectors:

```ts
@Window()
@Webview()
@Context()
```

`@Body()` is optional only if the actual Electrobun integration benefits from a meaningful payload abstraction.

No ordinary `@Arg(index)` requirement.

Runtime support:

- class-based adapter attachment to Bunwire Application;
- default Electrobun host/scaffold creation;
- declarative main-window configuration;
- declarative RPC configuration;
- typed callbacks exposing actual native Electrobun objects;
- adapter-created context stored in root container;
- adapter-owned Providers where useful for native bindings/runtime state;
- request registration;
- message registration;
- window/webview/context injection;
- outgoing Bun → Webview capability using Electrobun's actual runtime API;
- request result handling;
- message no-response semantics;
- manual-host/context integration path.

## Implementation steps

1. Implement `ElectrobunAdapter` class and compiler descriptor association.
2. Attach it through `Application.withAdapter()`.
3. Define configuration types for the normal Electrobun scaffold, including main window and RPC configuration.
4. Implement typed callbacks that receive the actual Electrobun native objects.
5. Implement host preparation so native context exists before Provider registration while managed traffic remains inactive.
6. Register Electrobun adapter-owned Providers required for native bindings/context integration.
7. Register `Route` and `Message` as managed method kinds allowed on `core.controller`.
8. Implement path/prefix normalization.
9. Implement `Window`, `Webview`, and `Context` as parameter injectors with resolver IDs.
10. Map generated Controller method registry to Electrobun request/message structures.
11. Map caller-visible positional arguments directly from generated argument indexes.
    Encode them unambiguously inside Electrobun's single native payload at the private adapter wire boundary; do not expose that encoding as Bunwire's caller API.
12. Ensure injected parameters never appear in caller signatures.
13. Preserve request/message semantic difference.
14. Complete native host startup only after Bunwire Providers/registries are ready.
15. Keep all created objects as real Electrobun objects and preserve native outgoing APIs.
16. Implement the manual Electrobun integration path using developer-supplied context.
    Because Electrobun exposes one mutable request handler and no getter, preservation of non-Bunwire requests is explicit through the manual adapter's fallback handler; Bunwire endpoints take precedence.

## Tests

### Compiler

- [ ] **[Automated / Compiler Fixture]** `ElectrobunAdapter` used in bootstrap exposes its compiler integration without duplicate build-config adapter declaration.
- [ ] **[Automated / Compiler Fixture]** `@Route("get")` creates an Electrobun request method entry.
- [ ] **[Automated / Compiler Fixture]** `@Message("selected")` creates a message entry.
- [ ] **[Automated / Compiler Fixture]** Controller prefix + method name normalizes correctly.
- [ ] **[Automated / Compiler Fixture]** Plain `id: string` becomes caller argument automatically.
- [ ] **[Automated / Compiler Fixture]** Interleaved `UserService` becomes container-injected automatically.
- [ ] **[Automated / Compiler Fixture]** `@Inject(CACHE)` disappears from caller-visible arguments.
- [ ] **[Automated / Compiler Fixture]** `@Window()` injector disappears from caller-visible arguments.
- [ ] **[Automated / Compiler Fixture]** No `@Arg(0)` is required in fixtures.

### Runtime

- [ ] **[Automated / E2E]** `app.start()` creates/configures the normal Electrobun host through the adapter.
- [ ] **[Automated / E2E]** Adapter context is available in the root container before adapter/application Provider registration that depends on it.
- [ ] **[Automated / E2E]** Main-window configuration reaches the real BrowserWindow creation path.
- [ ] **[Automated / E2E]** Native window callback receives the actual BrowserWindow object.
- [ ] **[Automated / E2E]** Native RPC callback receives the actual Electrobun RPC object.
- [ ] **[Automated / E2E]** Request reaches the intended Controller method.
- [ ] **[Automated / E2E]** Request return value reaches caller.
- [ ] **[Automated / E2E]** Message reaches intended Controller method without response contract.
- [ ] **[Automated / E2E]** `@Window()` receives the correct native object through the injector system.
- [ ] **[Automated / E2E]** Undecorated public Controller method is not exposed.
- [ ] **[Automated / E2E]** Managed traffic is not accepted before Providers/registries are ready.
- [ ] **[Automated / E2E]** Manual Electrobun path works with `withContext(existingContext).start()`.
- [ ] **[Automated / E2E]** Native outgoing communication remains usable without Bunwire replacing it.

## Exit criteria

A normal Electrobun application can be described primarily through adapter configuration and `app.start()`, while advanced users retain a documented manual-context path and full access to native Electrobun objects.

---

# Milestone 12 — Generated RPC Contracts and End-to-End Application

## Goal

Prove the intended developer experience from composition root through native host startup, and derive frontend typing from the same invocation plan used at runtime.

## Example target

Application classes:

```ts
@Service()
export class UserService {
  constructor(
    private readonly database: DatabaseService,
  ) {}
}

@Controller("users")
export class UserController {
  @Route("get")
  async get(
    id: string,
    users: UserService,
    @Inject(CACHE) cache: Cache,
    @Window() window: BrowserWindow,
    includePosts?: boolean,
  ): Promise<User> {
    return users.find(id);
  }
}
```

Composition root:

```ts
export default defineApp()
  .withAdapter(
    new ElectrobunAdapter({
      mainWindow: {
        title: "Users",
        width: 1200,
        height: 800,
      },
    }),
  );
```

Host entrypoint:

```ts
import registry from "virtual:bunwire/registry";
import app from "./bootstrap";

await app.withRuntimeRegistry(registry).start();
```

Generated caller contract:

```ts
"users/get": (
  id: string,
  includePosts?: boolean,
) => Promise<User>
```

Frontend integration:

```ts
import { Electroview } from "electrobun/view";
import {
  createBunwireClient,
  type BunwireClientSchema,
} from "virtual:bunwire/client";

const rpc = Electroview.defineRPC<BunwireClientSchema>({
  handlers: { requests: {}, messages: {} },
});
const { request, message } = createBunwireClient(rpc);

await request("users/get", id, includePosts);
message("users/deleted", id);
```

The generated registry must be attached before startup because Core does not import build-tool virtual modules. The generated client factory owns no platform encoding; it delegates that private boundary to the selected adapter's compiler-contributed client factory.

The Vite integration also maintains `.bunwire/virtual-modules.d.ts`, containing exact application-specific declarations for both virtual imports. The same public artifact generator writes physical registry/client modules for manual or non-Vite builds and avoids rewriting unchanged output.

## Implementation steps

1. Read caller-visible parameters from generated method plans.
2. Read TypeScript types for those parameters.
3. Exclude container/parameter-injector parameters from contracts.
4. Generate request return types.
5. Generate message no-response types.
6. Integrate contracts with the frontend Electrobun RPC API while exposing positional Bunwire calls and hiding the adapter-owned native payload encoding completely.
7. Create example application demonstrating:
   - `defineApp()` composition root;
   - class-based `ElectrobunAdapter`;
   - declarative main-window/RPC configuration;
   - native-object customization callback;
   - `app.start()` startup boundary;
   - Providers, including at least one adapter-owned Provider;
   - adapter context available through the container;
   - explicit token binding;
   - Service constructor DI;
   - Controller constructor DI;
   - managed-method auto DI;
   - explicit `@Inject()`;
   - adapter parameter injection;
   - caller argument validation;
   - middleware;
   - request/message behavior.
8. Add a second E2E/manual fixture demonstrating `withContext(existingContext).start()`.

## Tests

### Type level

- [ ] **[Automated / Type-level]** Correct caller arguments compile.
- [ ] **[Automated / Type-level]** Supplying `UserService` from frontend fails typecheck.
- [ ] **[Automated / Type-level]** Supplying `CACHE` value from frontend fails typecheck.
- [ ] **[Automated / Type-level]** Supplying `BrowserWindow` from frontend fails typecheck.
- [ ] **[Automated / Type-level]** Missing required caller argument fails typecheck.
- [ ] **[Automated / Type-level]** Optional caller argument can be omitted.
- [ ] **[Automated / Type-level]** Too many caller arguments fail typecheck where the API permits strict checking.
- [ ] **[Automated / Type-level]** Request return type is inferred correctly.
- [ ] **[Automated / Type-level]** Message does not expose a meaningful response type.

### Runtime/E2E

- [ ] **[Automated / E2E]** Importing `bootstrap.ts` creates/configures but does not start the Application.
- [ ] **[Automated / E2E]** `app.start()` performs startup exactly once.
- [ ] **[Automated / E2E]** Full Electrobun adapter creates the normal native context from declarative config.
- [ ] **[Automated / E2E]** Native callbacks receive actual Electrobun objects.
- [ ] **[Automated / E2E]** Adapter-created context is available to Providers during registration.
- [ ] **[Automated / E2E]** Request with correct caller args reconstructs complete server method args.
- [ ] **[Automated / E2E]** Request with too few runtime args fails clearly.
- [ ] **[Automated / E2E]** Request with too many runtime args fails clearly.
- [ ] **[Automated / E2E]** Provider `register()` runs once for the process/application lifetime.
- [ ] **[Automated / E2E]** Provider `boot()` runs for each request/message invocation.
- [ ] **[Automated / E2E]** Adapter-owned Providers participate in the same lifecycle as application Providers.
- [ ] **[Automated / Architecture]** No service/controller is manually instantiated by application code.
- [ ] **[Automated / Architecture]** No manual RPC handler table is required.
- [ ] **[Automated / E2E]** Manual-host fixture starts successfully with `withContext(existingContext)`.

## Exit criteria

The same generated method plan drives both server invocation and frontend typing, and both the recommended full-adapter path and manual-context escape hatch work end to end.

---

# Middleware Redesign Track — Milestones 12A–12F

Milestone 12 completed the original exported-function middleware attachment. That record remains historically accurate, but the callback model is superseded by Bunwire's managed, class-based, adapter-driven middleware architecture.

The authoritative design is [MIDDLEWARE.md](MIDDLEWARE.md). The complete deliverables, tests, exclusions, and exit criteria for Milestones 12A–12F are in [MIDDLEWARE_MILESTONES.md](MIDDLEWARE_MILESTONES.md).

Milestones 12A–12F are a required pre-release track. They must complete in order before Milestone 13 begins. The track introduces managed middleware classes and DI, compiler metadata, canonical local and centralized attachments, static groups/controller mappings, adapter-owned filtering/context, Electrobun integration, removal of callback middleware, and a fake second-adapter proof.

---

# Milestone 13 — Hardening and First Release

## Goal

Turn the architecture into a dependable initial release without expanding scope prematurely.

Prerequisite: every acceptance criterion and exit gate in Middleware Redesign Milestones 12A–12F is complete. Milestone 13 remains blocked until then.

## Deliverables

- polished diagnostics;
- architecture regression tests;
- public API review;
- release-ready example;
- documentation;
- build/runtime performance sanity checks;
- fake second-adapter proof;
- explicit deferred-feature list.

## Implementation steps

1. Audit Core for adapter/platform leakage.
2. Audit terminology: Provider vs binding vs Service.
3. Audit all class/method kind APIs for extension safety.
4. Improve compiler diagnostics with file/method/parameter locations.
5. Add regression fixtures for every compiler bug fixed during development.
6. Measure representative compiler analysis time.
7. Measure runtime startup/invocation overhead.
8. Verify generated output does not churn unnecessarily.
9. Build a minimal second adapter/class-kind example.
10. Document Provider lifecycle explicitly.
11. Document automatic vs explicit DI rules explicitly.
12. Document two-index managed-method parameter mapping.
13. Document `bunwire.config.*` vs `bootstrap.ts` responsibilities.

## Tests

### Architecture

- [ ] **[Automated / Architecture]** `core` contains no Vite import.
- [ ] **[Automated / Architecture]** `core` contains no Electrobun import.
- [ ] **[Automated / Architecture]** Vite contains no hard-coded Electrobun decorator switch.
- [ ] **[Automated / Architecture]** Fake second adapter adds its own outer/method decorators without Core modifications.
- [ ] **[Automated / Architecture]** Runtime contains no filesystem source discovery.

### DI policy

- [ ] **[Automated / Compiler Fixture]** Managed class auto-injects by type.
- [ ] **[Automated / Compiler Fixture]** Plain class does not accidentally auto-inject.
- [ ] **[Automated / Integration]** Plain class with explicit `@Inject(Class)` + binding resolves.
- [ ] **[Automated / Compiler Fixture]** Interface requires explicit token.
- [ ] **[Automated / Behavioral]** Missing runtime token binding errors clearly.

### Invocation

- [ ] **[Automated / Integration]** Interleaved injected/caller parameters remain correct.
- [ ] **[Automated / Generated Output]** Generated caller indexes remain stable.
- [ ] **[Automated / Compiler Fixture]** Parameter injector indexes remain correct.
- [ ] **[Automated / Compiler Fixture]** No ordinary `@Arg(index)` API is required.

### Provider lifecycle

- [ ] **[Automated / Integration]** `register()` exactly once.
- [ ] **[Automated / Integration]** `boot()` per invocation.
- [ ] **[Automated / Integration]** concurrent invocation state isolation.

### Release

- [ ] **[Automated / Build]** Clean checkout installs, typechecks, tests, and builds.
- [ ] **[Automated / Build]** Example Electrobun application builds.
- [ ] **[Automated / Type-level]** Generated contracts compile in frontend example.
- [ ] **[Automated / Architecture]** Public package exports contain only intended APIs.

## Exit criteria

First release is allowed only when all architectural gates and end-to-end tests are green.

---

# Milestone 14 — Core Events and Managed Listeners

## Goal

Add runtime-independent, compiler-backed events and DI-managed listeners to Core without creating a second architecture or runtime source discovery path.

## Deliverables

- canonical Core `@Event()` and `@Listener(Event)` decorators and class kinds;
- optional protected literal event aliases with a generated canonical alias index;
- compiler validation of event declarations, listener targets, and exact `handle(event)` contracts;
- immutable generated event definitions, listener definitions, managed handle plans, and explicit ordered relationships;
- application-owned, replaceable `EventDispatcher` using exact constructor identity;
- sequential, fail-fast, zero-listener, nested, and concurrent-safe direct dispatch;
- listener constructor DI and one invocation scope/Provider boot pass per event dispatch;
- documentation establishing Core ownership and deferring queue integration.

## Implementation steps

1. Add canonical event/listener kinds, decorators, runtime definitions, errors, and public exports.
2. Extend `RuntimeRegistry` and Application validation with identity-shared event/listener/alias records.
3. Bind the default dispatcher before Provider registration and reuse the invocation engine for handle plans.
4. Register Core symbols in compiler extension aggregation and add event/listener-specific static analysis.
5. Generate source-ordered relationships and a lexical alias index without runtime discovery.
6. Add behavioral, adversarial, generated-output, DI, inheritance, and regression coverage.
7. Update Core architecture, package guides, Bun ownership notes, exports, and progress records.

## Tests

- [x] **[Automated / Compiler]** Exact Core symbols and re-exports are recognized; same-name and same-ID counterfeits cannot authorize event/listener behavior.
- [x] **[Automated / Compiler]** Event payload constructors are not DI-analyzed and events require no handler.
- [x] **[Automated / Compiler]** Alias syntax, uniqueness, non-inheritance, and deterministic indexing are enforced.
- [x] **[Automated / Compiler]** Listener event targets and exact public concrete `handle(event)` signatures are validated.
- [x] **[Automated / Generated Output]** Event definitions, listener plans, relationships, aliases, imports, and hashes are deterministic.
- [x] **[Automated / Integration]** Listener dependencies and `EventDispatcher` resolve through the normal container.
- [x] **[Automated / Runtime]** Zero, one, multiple, failing, nested, subclass, concurrent, and replacement-dispatcher cases follow the documented semantics.
- [x] **[Automated / Regression]** Managed classes/methods, DI, adapters, callers, generated registries, and package boundaries remain green.

## Exit criteria

Core owns canonical direct events completely; no High/Medium correctness finding remains; focused suites, full typechecking, all tests, all builds, export audits, boundaries, and generated-output inspection pass; queues remain unimplemented.

---

# Release Checkpoints

## Checkpoint A — Core Runtime Kernel

After Milestone 5:

```text
Managed class definitions
Service / Controller / Provider kinds
Container + bindings
Tokens + scopes
Application builder/start boundary
Provider lifecycle
Generic managed method metadata
Generic invocation engine
```

## Checkpoint B — Extensible Core

After Milestone 6:

A class-based fake adapter can attach to an Application, create/store host context, contribute Providers/injectors, and add its own controller-like class kind and route-like method kind without changing Core.

## Checkpoint C — Compiler Vertical Slice

After Milestone 10:

```text
bunwire.config
Source discovery
TypeScript symbols
Constructor DI plans
Managed method parameter plans
Generated registries
Runtime execution
Fake adapter integration
```

No Electrobun-specific architecture is required to prove the framework.

## Checkpoint D — Electrobun Alpha

After Milestone 11:

```text
@Controller
@Route
@Message
@Window/@Webview/@Context parameter injectors
Class-based adapter startup
Provider register/boot lifecycle
Auto caller-argument mapping
Container method injection
Electrobun request/message runtime
```

## Checkpoint E — Typed Electrobun Beta

After Milestone 12:

Adds generated frontend contracts derived from caller-visible parameters.

## Checkpoint F — First Release Candidate

After Milestone 13.

---

# Cross-Milestone Test Matrix

| Capability | Unit | Compiler fixture | Integration | E2E/type |
|---|---:|---:|---:|---:|
| Tokens/bindings | ✓ |  | ✓ | ✓ |
| Singleton/transient | ✓ |  | ✓ | ✓ |
| Managed class definitions | ✓ | ✓ | ✓ |  |
| Service constructor DI | ✓ | ✓ | ✓ | ✓ |
| Explicit `@Inject()` | ✓ | ✓ | ✓ | ✓ |
| Plain-class non-auto-DI rule | ✓ | ✓ | ✓ | ✓ |
| Provider `register()` | ✓ | ✓ | ✓ | ✓ |
| Provider `boot()` | ✓ |  | ✓ | ✓ |
| Generic class-kind extension | ✓ | ✓ | ✓ | ✓ |
| Generic method-kind extension | ✓ | ✓ | ✓ | ✓ |
| Method true indexes | ✓ | ✓ | ✓ | ✓ |
| Caller argument indexes | ✓ | ✓ | ✓ | ✓ |
| Interleaved injection | ✓ | ✓ | ✓ | ✓ |
| Caller argument validation | ✓ | ✓ | ✓ | ✓ |
| Parameter injector/resolver | ✓ | ✓ | ✓ | ✓ |
| Source discovery/config |  | ✓ | ✓ | ✓ |
| Generated registry | ✓ | ✓ | ✓ | ✓ |
| Runtime without scanning | ✓ |  | ✓ | ✓ |
| Electrobun requests |  | ✓ | ✓ | ✓ |
| Electrobun messages |  | ✓ | ✓ | ✓ |
| Generated RPC contracts |  | ✓ | ✓ | ✓ |
| Platform independence | ✓ | ✓ | ✓ | ✓ |
| Core events/listeners | ✓ | ✓ | ✓ | ✓ |

---

# Definition of Done for Every Milestone

A milestone is complete only when:

- [ ] its public behavior is implemented;
- [ ] required unit tests pass;
- [ ] compiler fixtures pass where applicable;
- [ ] integration tests pass where applicable;
- [ ] relevant E2E/type-level tests pass;
- [ ] no architectural gate is violated;
- [ ] new public APIs have concise documentation;
- [ ] compiler/runtime errors are actionable;
- [ ] generated output is deterministic where applicable;
- [ ] terminology remains consistent;
- [ ] deferred behavior is explicitly deferred rather than half-implemented.

---

# Explicitly Deferred Until After the First Release

The following should not block the initial architecture:

- advanced scopes beyond the initial singleton/transient/invocation scope model;
- lazy/cycle-breaking providers;
- compile-time interpretation of dynamic/arbitrary Provider binding logic inside `register()` / `boot()`;
- Vite execution of Provider lifecycle methods;
- compile-time proof that every dynamic token binding exists at runtime;
- high-level generated frontend API such as `rpc.users.get(id)`;
- simultaneous unrelated platform adapters unless a concrete use case requires it;
- automatic exposure of public Controller methods;
- automatic DI of every plain TypeScript class;
- manual `@Arg(index)` as a required normal calling convention;
- replacing Electrobun's native object semantics or outgoing communication APIs;
- complex JavaScript data-flow analysis unless real compiler cases justify it.

---

# Final Success Condition

Bunwire succeeds when developers write:

```text
Managed classes
Services
Controllers
Providers
Bindings
Typed managed methods
Application logic
A bootstrap composition root
Adapter configuration
```

while the build system compiles:

```text
Class kinds
Constructor dependency positions
Managed methods
Method parameter positions
Caller-visible argument indexes
Container injection plans
Parameter injector/resolver plans
Generated registries
Generated contracts
```

and the normal runtime path is:

```text
Import configured Application
      ↓
app.start()
      ↓
Adapter prepares native host context
      ↓
Store context in root container
      ↓
Run Provider.register() once
      ↓
Connect generated registries
      ↓
Adapter completes native host start
      ↓
Accept invocation
      ↓
Run Provider.boot()
      ↓
Resolve generated parameter/injector plan
      ↓
Invoke target method
      ↓
Return through selected adapter
```

For Electrobun, the recommended adapter owns the ordinary scaffold/configuration while still exposing the actual native objects through callbacks. The frontend supplies only the arguments it can actually own. Server-side Services, tokens, and platform objects are inserted by Bunwire into their true method positions according to the compiled plan.

A documented manual path remains available through `withContext(existingContext).start()` for applications that already own their native host.

That is the release-defining architecture.
