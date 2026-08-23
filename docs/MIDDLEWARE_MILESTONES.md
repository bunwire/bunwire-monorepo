# Bunwire Managed Middleware Redesign Milestones

Status: Planned pre-release track. Milestones 12A–12F must complete in order before Milestone 13 — Hardening and First Release begins.

Architecture: [MIDDLEWARE.md](MIDDLEWARE.md)

The completed Milestone 12 callback middleware remains historical implementation evidence. This track replaces it with managed, class-based, adapter-driven middleware. Temporary internal coexistence is permitted only to keep intermediate milestones integrated and green; Milestone 12F removes the callback API completely.

---

# Milestone 12A — Core Managed Middleware Foundation

## Goal

Establish platform-independent managed middleware identity, DI, attachment contracts, and generic around-invocation execution without changing adapter behavior yet.

## Deliverables

- built-in `core.middleware` managed class kind;
- canonical `@Middleware()` decorator;
- generic `Middleware<Context, Result>` contract;
- canonical middleware definition and attachment types;
- transient-per-invocation convention binding;
- generic middleware chain executor;
- generic around-invocation hook that shares the existing invocation child container and Provider boot lifecycle;
- strict runtime validation and dedicated errors.

## Implementation Steps

1. Define the middleware kind as injectable, discoverable, constructor-analyzed, registry-emitted, transient, and unable to own managed methods.
2. Add the canonical decorator and runtime metadata needed to validate middleware class identity.
3. Define immutable attachment records containing a canonical middleware class and ordered string parameters.
4. Add a generic chain executor that resolves each class from an invocation container, calls `handle(context, next)`, Promise-normalizes results, supports short-circuiting, and rejects repeated `next()` calls.
5. Add an around-invocation option so adapters can wrap the terminal managed-method invocation without creating a second invocation scope.
6. Preserve callback middleware temporarily as internal migration scaffolding; do not present it as the target API.
7. Export only the intentional foundation APIs from Core.

## Acceptance Criteria

- [ ] Middleware classes resolve through constructor DI from the invocation child container.
- [ ] Two concurrent invocations receive different middleware instances.
- [ ] Singleton dependencies injected into transient middleware retain singleton identity.
- [ ] Middleware executes before/after the terminal continuation in declared order.
- [ ] Middleware may short-circuit or transform the result.
- [ ] `next()` may be called at most once.
- [ ] Provider `boot()` and middleware share one invocation scope.
- [ ] Core contains no adapter/platform concepts.

## Tests

- unit tests for decorator/kind identity and malformed targets;
- container tests for transient resolution and constructor dependencies;
- chain tests for order, result transformation, errors, short-circuiting, and repeated `next()`;
- concurrent invocation isolation tests;
- package-boundary and public-export tests.

## Expected Behavior

Core can execute a prebuilt list of canonical middleware attachments around any terminal continuation when an adapter supplies contexts.

## Not Expected Yet

- compiler discovery;
- `@Use()` class/alias attachments;
- groups or centralized policy;
- adapter filtering or Electrobun integration;
- removal of callback middleware.

## Exit Criterion

A platform-independent test resolves class middleware through DI and executes it around a managed Controller invocation in the same invocation scope.

---

# Milestone 12B — Compiler Discovery and Metadata

## Goal

Discover canonical middleware classes and compile their self-describing metadata and constructor plans without constructing them.

## Deliverables

- exact-symbol authorization for `@Middleware()`;
- middleware class discovery in the bounded source graph;
- literal metadata extraction for `alias`, `include`, `exclude`, `only`, and `except`;
- middleware `handle()` structural validation;
- constructor DI analysis through existing managed-class rules;
- duplicate alias and metadata diagnostics;
- deterministic generated middleware class entries.

## Implementation Steps

1. Register `@Middleware()` with the canonical Core compiler symbol model.
2. Extend managed-class analysis for the middleware kind and exported runtime references.
3. Read only protected instance property initializers with supported names and deterministic literal values.
4. Reject calls, spreads, variables, getters, constructor assignments, computed values, invalid types, duplicate filter values, and simultaneous `only`/`except`.
5. Require a concrete callable instance `handle(context, next)` implementation.
6. Detect duplicate aliases across the complete configured source universe.
7. Generate transient middleware class registry entries with compiled metadata and indexed dependencies.

## Acceptance Criteria

- [ ] Canonical, aliased, and re-exported `@Middleware()` symbols are recognized.
- [ ] Same-ID counterfeit symbols are rejected.
- [ ] Middleware classes must be named, exported, concrete, and have `handle()`.
- [ ] Supported literal metadata is emitted deterministically.
- [ ] Dynamic/non-literal metadata fails with source-located diagnostics.
- [ ] `only` plus `except` fails compilation.
- [ ] Duplicate aliases fail deterministically.
- [ ] Constructor DI and cycle validation match other injectable managed classes.
- [ ] Compiler analysis never constructs middleware or executes `handle()`.

## Tests

- compiler fixtures for canonical aliases/re-exports and counterfeit decorators;
- valid/invalid literal metadata fixtures;
- duplicate alias and `only`/`except` fixtures;
- abstract/missing/static `handle()` fixtures;
- constructor DI, token, plain-class, interface, and cycle fixtures;
- deterministic generated output and semantic typecheck tests.

## Expected Behavior

The generated registry knows every middleware's canonical class, alias, filters, transient scope, and constructor dependencies.

## Not Expected Yet

- `@Use()` attachments;
- groups, global stacks, or controller mappings;
- runtime adapter matching.

## Exit Criterion

A middleware class with constructor DI and literal metadata is compiled into a deterministic, type-correct runtime registry without executing application code.

---

# Milestone 12C — Local Middleware Attachments

## Goal

Replace callback-oriented `@Use()` semantics with canonical managed middleware attachments on Controllers and managed methods.

## Deliverables

- canonical `@Use()` accepting middleware classes and string references;
- Controller-level and method-level attachments;
- alias and parameterized-reference parsing;
- immutable canonical attachment records;
- deterministic source ordering;
- compiler/runtime validation for local attachments.

## Implementation Steps

1. Change the target `@Use()` contract to accept one or more middleware class references or alias/group strings.
2. Authorize the exact canonical Core symbol and reject counterfeit decorators.
3. Resolve class references by canonical symbol and alias references through discovered middleware definitions.
4. Parse the first `:` as the parameter boundary and `,` as the parameter separator; trim values and reject empty entries or unsupported escaping.
5. Support `@Use()` on a managed Controller class and on its concrete managed methods only.
6. Preserve left-to-right argument order and top-to-bottom decorator source order.
7. Emit class and method attachments as canonical class references plus frozen string parameters.
8. Retain callback behavior only where necessary for existing E2E tests until the replacement reaches adapters.

## Acceptance Criteria

- [ ] `@Use(AuthMiddleware)` resolves by canonical class symbol.
- [ ] `@Use("auth")` resolves through one canonical alias.
- [ ] `@Use("auth:admin,user")` emits `['admin', 'user']` without coercion.
- [ ] Controller and method attachments are distinguished and ordered.
- [ ] Unknown aliases, unexported classes, invalid targets, empty references, and malformed parameters fail compilation.
- [ ] Runtime plans contain no unresolved alias strings for implemented local references.
- [ ] Local attachment generation is byte-stable.

## Tests

- compiler fixtures for class, alias, parameter, ordering, and target placement;
- counterfeit `@Use()` and counterfeit middleware class tests;
- malformed-reference fixtures;
- generated output/typecheck tests;
- Core runtime validation tests for malformed attachment records.

## Expected Behavior

Application source can attach managed middleware locally by canonical class or alias, and generated metadata contains normalized attachments.

## Not Expected Yet

- application-global middleware;
- group expansion;
- controller source mappings;
- Electrobun filter execution.

## Exit Criterion

A generated Controller method plan contains correctly ordered class-level and method-level canonical middleware attachments with immutable parameters.

---

# Milestone 12D — Application Policy, Groups, and Normalization

## Goal

Compile centralized middleware policy into the final authoritative per-method attachment order.

## Deliverables

- `Application.withMiddlewares()` composition API;
- strictly static compiler DSL;
- global middleware stacks;
- named and nested groups;
- controller source-pattern mappings;
- group/name validation and cycle detection;
- four-scope ordering and exact-attachment deduplication;
- fully normalized generated plans.

## Implementation Steps

1. Add one direct `withMiddlewares(registry => { ... })` call to the Application composition API.
2. Make the runtime Application method validate/record the configuration boundary without executing the callback or rebuilding middleware policy.
3. Parse its callback statically from the exported bootstrap chain without importing/executing it.
4. Permit only direct literal `registry.use()`, `registry.group()`, and `registry.controllers()` statements.
5. Reject indirect callbacks, multiple blocks, control flow, helpers, spreads, computed properties, and non-literal configuration.
6. Resolve aliases/classes, expand groups depth-first in place, and detect unknown names, duplicates, alias/group collisions, and cycles.
7. Match controller patterns against normalized configured-source-root-relative paths and fail unmatched patterns.
8. Compose global, mapped-controller, controller-decorator, and method-decorator attachments in that order.
9. Deduplicate exact canonical class-plus-parameter attachments at their earliest occurrence while retaining distinct parameterizations.
10. Emit only final canonical attachments; do not emit groups, aliases, or filesystem patterns for runtime resolution.

## Acceptance Criteria

- [ ] One static configuration block compiles without executing application code.
- [ ] Importing/running the Application composition does not execute the middleware DSL callback.
- [ ] A manual/prebuilt registry must already contain normalized middleware data and does not trigger runtime DSL interpretation.
- [ ] Global middleware reaches every compatible managed method.
- [ ] Nested groups expand in deterministic depth-first order.
- [ ] Direct and indirect cycles fail with the complete cycle path.
- [ ] Alias/group collisions and unknown references fail clearly.
- [ ] Controller patterns match normalized source-relative paths across configured roots.
- [ ] Unmatched patterns fail compilation.
- [ ] Final order is global → mapped Controller → Controller `@Use()` → method `@Use()`.
- [ ] Exact duplicates run once at the earliest position; different parameters remain separate.
- [ ] Generated output contains no unresolved groups, aliases, or source patterns.

## Tests

- static DSL acceptance/rejection fixtures;
- global and nested-group ordering tests;
- group-cycle and name-conflict fixtures;
- Windows/POSIX normalized controller-pattern tests;
- unmatched-pattern tests;
- cross-scope ordering and deduplication generated-output tests;
- proof that bootstrap callbacks and application code are not executed by the compiler.

## Expected Behavior

Every generated managed method carries its complete canonical middleware policy before runtime starts.

## Not Expected Yet

- interpretation of adapter path/transport filters;
- native runtime integration;
- final removal of migration scaffolding.

## Exit Criterion

A fixture combining globals, nested groups, controller mappings, class attachments, and method attachments produces one deterministic, fully normalized method pipeline.

---

# Milestone 12E — Electrobun Adapter Integration

## Goal

Execute generated managed middleware around Electrobun request/message dispatch while preserving native behavior and the existing Controller invocation path.

## Deliverables

- `ElectrobunMiddlewareContext`;
- Electrobun endpoint glob matching;
- `request`/`message` transport filtering;
- per-attachment context construction with parameters;
- middleware chain integration around `context.invoke()`;
- request result/short-circuit semantics;
- message failure handling;
- normal and manual host compatibility;
- native middleware/RPC coexistence.

## Implementation Steps

1. Add the public Electrobun middleware context with endpoint, transport, native objects, logical args, and attachment parameters.
2. Validate Electrobun `only`/`except` values before traffic is accepted.
3. Match `include`/`exclude` against normalized endpoints with literal, `*`, and `**` semantics; make exclude win.
4. Select applicable attachments per RPC event without resolving skipped middleware.
5. Execute the Core chain in the same invocation scope as Provider boot and Controller resolution.
6. Use managed Controller invocation as the terminal continuation.
7. Return request short-circuit/transformed results through native RPC.
8. Ignore message results and route failures through `onMessageError` or existing fallback logging.
9. Preserve readiness gating, manual request fallback, native listeners, outgoing RPC, and exact native objects.

## Acceptance Criteria

- [ ] Request and message middleware receive the correct typed context.
- [ ] Attachment parameters differ safely across uses of one transient class.
- [ ] Include requires a match; exclude overrides it.
- [ ] `only: ['request']` skips messages and `except: ['message']` behaves equivalently.
- [ ] Skipped middleware is not constructed.
- [ ] Middleware may short-circuit or transform a request result.
- [ ] Middleware errors propagate for requests and use message error handling for messages.
- [ ] Provider boot, middleware, resolvers, and Controller execute in one invocation scope.
- [ ] Normal and manual adapters execute the same generated policy.
- [ ] Native Electrobun APIs remain available and unchanged.

## Tests

- adapter unit tests for glob and transport matching;
- request/message chain order and context tests;
- skipped-construction, short-circuit, transform, and error tests;
- normal/manual E2E tests with DI middleware;
- readiness/fallback/native API regressions;
- real Electrobun SDK contract and native-process smoke tests.

## Expected Behavior

Electrobun resolves and executes only applicable managed middleware before entering the existing generated Controller plan.

## Not Expected Yet

- Express implementation;
- universal path semantics;
- final removal of every callback artifact;
- release hardening outside middleware.

## Exit Criterion

The real Electrobun request/message smoke path passes through generated class middleware with DI, filters, parameters, short-circuiting, and correct Controller dispatch.

---

# Milestone 12F — Migration, Second-Adapter Proof, and Verification

## Goal

Complete the breaking replacement, remove callback middleware, prove adapter extensibility, and leave the repository ready for Milestone 13.

## Deliverables

- removal of `ManagedMethodMiddleware` callback APIs;
- removal of callable generated middleware arrays and callback compiler analysis;
- migrated examples, fixtures, tests, and documentation;
- fake second-adapter middleware proof;
- complete public API audit;
- clean build/test/native/install verification;
- completed middleware progress records.

## Implementation Steps

1. Remove callback `ManagedMethodMiddleware`, callback-oriented `@Use()`, callable plan validation/execution, and generator imports.
2. Remove all temporary compatibility branches introduced during 12A–12E.
3. Migrate the Electrobun example and all fixtures to `@Middleware()` classes and canonical attachments.
4. Add a fake non-Electrobun adapter with its own context, transport vocabulary, matching behavior, and terminal continuation.
5. Verify the fake adapter requires no Core or generic Vite platform branches.
6. Update the architecture, package READMEs, tests documentation, migration guidance, and public API examples.
7. Audit exports and generated artifacts for legacy callback names or shapes.
8. Run focused suites, all regression tests, typechecking, builds, clean install, SDK compatibility, and native Electrobun smoke.
9. Update `progress.md` and dedicated `progress/milestone-12a.md` through `milestone-12f.md` records with exact results.

## Acceptance Criteria

- [ ] No callback middleware public API or generated representation remains.
- [ ] `@Use()` accepts only managed class/string references defined by the new contract.
- [ ] All examples demonstrate class middleware with DI and adapter context.
- [ ] Generated registries contain only canonical definition/attachment records.
- [ ] Fake second adapter implements middleware without Core/Vite changes.
- [ ] Existing DI, Provider, controller invocation, Electrobun RPC, and generated client behavior remain green.
- [ ] Public docs consistently identify class-based middleware as the only Bunwire middleware model.
- [ ] Full quality, build, clean-install, SDK, and native smoke gates pass.
- [ ] Milestone 13 is unblocked only after every 12A–12F criterion is recorded complete.

## Tests

- repository-wide legacy-symbol absence checks;
- Core/Vite/Electrobun public API type tests;
- full compiler/generated/runtime/E2E regression suite;
- fake second-adapter architecture and behavior tests;
- example independent build;
- boundary, typecheck, test, build, clean-install, SDK contract, and native-process gates.

## Expected Behavior

Bunwire exposes one middleware programming model: compiler-discovered transient classes, canonical generated attachments, and adapter-owned context/filter/native integration.

## Not Expected Yet

- configurable middleware lifetimes;
- priorities;
- typed/coerced parameters;
- Express production adapter;
- optional post-release middleware features.

## Exit Criterion

No legacy callback middleware remains, two adapters prove the generic boundary, all quality gates pass, and Milestone 13 — Hardening and First Release may begin.
