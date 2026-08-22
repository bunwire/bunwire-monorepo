# Milestone 6 — Class-Based Adapter and Extension API

Status: Complete

## Packages Changed

- `packages/core` (planned/current)
- root test infrastructure (planned/current)
- Core API documentation (planned/current)

## Implemented

- Authoritative architecture, complete Milestone 6 requirements, architectural gates, tests, exit criteria, and Milestones 0–5 implementation history reviewed.
- Existing Application, Provider lifecycle, managed-class registry, managed-method plan, resolver registry, and invocation engine inspected before implementation.
- Class-based `Adapter<Context>` protocol with own static compiler descriptors, same-Application attachment, one-primary-host semantics, and manual-context fallback.
- Guarded compiler descriptors for class kinds/decorators, method kinds/decorators, parameter injectors, and compiler metadata handlers.
- Guarded runtime contributions for adapter-owned Providers, parameter resolvers, registry consumers, and validation hooks.
- Generic managed-method decorator and parameter-injector definitions with source-independent metadata.
- Canonical method-kind registry and idempotent/conflict-rejecting resolver registration, extending the Milestone 5 class-kind defense to new extension identities.
- Runtime registry contract and validation for adapter-consumed managed class/method metadata.
- Application lifecycle integration in the required order: prepare host context, store context, validate, register Providers, connect registry consumers, complete host start, enter running state.
- Fake adapter proving a custom class kind/decorator, method kind/decorator, parameter injector/resolver, adapter Provider, fake native host/context, native callback, full invocation, and manual context.

## Remaining

- None.

## Acceptance Criteria

- [x] Adapter must be a class instance matching the adapter contract.
- [x] `withAdapter()` attaches the same Application returned by `defineApp()`.
- [x] Adapter contributes a Provider before startup.
- [x] Adapter-prepared context is available during Provider `register()`.
- [x] Fake adapter adds a managed class kind without Core changes.
- [x] Fake adapter adds a managed method kind without Vite changes.
- [x] Fake adapter receives generated class/method metadata.
- [x] Fake parameter injector participates in invocation and remains caller-invisible.
- [x] Invalid managed-method placement is rejected.
- [x] Injector, class-kind, and method-kind IDs are namespaced.
- [x] Fake host accepts no invocation until Providers and registries are ready.
- [x] Native callback receives the real fake-host object.
- [x] Manual adapter path uses `withContext(existingContext).start()`.
- [x] Conflicting canonical or extension identities cannot silently replace authoritative descriptors.
- [x] Malformed contributions and invalid adapter state fail with actionable diagnostics.

## Tests Added

- `tests/milestone-06/adapter-extension.test.ts` — 21 behavioral, integration, unit, architecture, lifecycle-ordering, manual-host, and adversarial extension-boundary tests.
- `tests/README.md` — literal Milestone 6 acceptance-to-automation mapping.

## Tests Run

- `node_modules\\.bin\\tsc.cmd -b packages/core --pretty false`
- `node_modules\\.bin\\tsc.cmd -p tsconfig.tests.json --noEmit --pretty false`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-06 --reporter=verbose`
- `node_modules\\.bin\\vitest.cmd run --reporter=dot`
- `pnpm quality`
- `pnpm --filter @bunwire/core test`
- `pnpm test:architecture`
- `pnpm test:clean-install`
- built-output public-export smoke check with Node ESM
- Core platform-reference scan
- `git diff --check`

## Test Results

- Passed: finalized Milestone 6 suite, 1 file and 21 tests.
- Passed: full quality gate — package boundaries, production/test typechecking, 108 tests across 9 files, and all four workspace package builds.
- Passed: Core package regression suite, 98 tests across 7 files.
- Passed: focused architecture suite, 3 tests.
- Passed: isolated frozen-lockfile clean installation and workspace typecheck.
- Passed: built Core entrypoint exposes Adapter, compiler/runtime descriptor helpers, method/injector APIs, runtime registry APIs, validation hooks, and the method-kind registry.
- Passed: Core production source contains no Electrobun, Express, BrowserWindow, or Webview references.
- Passed: repository diff whitespace/error validation.
- Failed: the first sandboxed clean-install attempt could not access npm (`EACCES`); the required approved unrestricted rerun passed. No implementation failure remained.
- Skipped: none.

## Regression Checks

- Milestones 0–5 pass alongside Milestone 6.
- Core remains platform-independent and passes mechanically enforced package boundaries.
- Core, Vite, Electrobun, and the example package all build successfully.
- All test definitions remain centralized beneath `tests/`.
- Frozen-lockfile clean installation and production/test typechecking pass.

## Expected Behavior

After this milestone, a fake class-based host adapter will attach to an existing Application, contribute generic Core extensions and Providers, prepare/store native context, consume runtime registry metadata, and begin host traffic only after the established startup phases complete.

- One primary `Adapter` instance attaches to the same unstarted Application.
- Adapter-prepared or manual context is root-container-accessible before Provider registration.
- Adapter-owned Providers share the normal register/boot lifecycle.
- Prebuilt/generated registry metadata connects to the host after registration and dispatches through the existing invocation engine.
- Adapter parameter injectors stay out of caller arguments.
- Typed native callbacks receive the actual host object.
- Conflicting or malformed extension identities fail closed with actionable diagnostics.

## Not Expected Yet

- `bunwire.config.*`, Vite source discovery, TypeScript symbol analysis, generated registry emission, Electrobun behavior, or generated frontend contracts.

## Important Decisions

- Adapter integration will extend the existing Application/InvocationEngine and Provider lifecycle rather than introduce a parallel kernel.
- Canonical class-kind protections from Milestone 5 remain authoritative for adapter-contributed kinds; new extension identities will use equivalent conflict rejection.
- Compiler-facing adapter contributions are declared on the adapter class as an own static descriptor, so future build tooling can resolve them without executing arbitrary runtime instance configuration.
- Runtime registry consumers connect prebuilt/generated metadata after Provider registration and dispatch through `Application.invokeManagedMethod()`, preserving Provider boot and invocation scope ordering.
- The base adapter supports manual context; full adapters override preparation to create native context and may explicitly honor the same manual path.

## Architectural Issues Encountered

- No conflict with the authoritative architecture was found.
- The first clean-install attempt was blocked by sandbox network policy rather than repository behavior; the approved unrestricted rerun established the required clean-install result.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Compiler source discovery, actual generated registry emission, platform-specific adapters, and frontend contracts remain intentionally deferred to their documented later milestones.

## Blockers

- None.

## Next Work Within This Milestone

- None. Every Milestone 6 deliverable, required test, architectural gate, and exit criterion has been audited and passes; Milestone 7 was not started.
