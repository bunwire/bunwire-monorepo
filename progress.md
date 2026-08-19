# Bunwire Implementation Progress

## Current Status

Current milestone: Milestone 2 complete; Milestone 3 not started

Overall status:

- Milestone 0: Complete
- Milestone 1: Complete
- Milestone 2: Complete
- Milestone 3+: Not started

## Completed Milestones

### Milestone 0 — Monorepo and Quality Foundation

Packages changed:

- repository workspace/tooling configuration
- `packages/core`
- `packages/vite`
- `packages/electrobun`
- `examples/electrobun-app`

Implemented:

- pnpm workspace with Core, Vite, Electrobun, and example package boundaries.
- Shared strict TypeScript project references and independent package builds.
- Public package entrypoints/exports.
- Vitest root test runner and compiler-fixture root.
- Automated Core forbidden-import scanner and CI-style `quality` command.
- Explicit dependency build allowlist and reproducible non-interactive pnpm script execution.

Tests added:

- Architecture tests that deliberately reject `core -> vite` and `core -> electrobun` imports.
- Architecture test that scans the actual Core source tree.

Tests run:

- `pnpm check:boundaries`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @bunwire/core build`
- `pnpm --filter @bunwire/vite build`
- `pnpm --filter @bunwire/electrobun build`
- `pnpm --filter @bunwire/example-electrobun-app build`

Result:

- Passed. Root tests: 1 file, 3 tests.

Acceptance criteria:

- [x] Core builds without Vite as a runtime dependency.
- [x] Core builds without Electrobun as a runtime dependency.
- [x] A deliberate `core -> vite` import fails the architecture test.
- [x] A deliberate `core -> electrobun` import fails the architecture test.
- [x] Workspace typecheck succeeds after dependency installation.
- [x] Workspace tests run from the root.
- [x] Packages build independently.

Expected behavior:

- Package boundaries are mechanically enforced before framework implementation begins.

Not expected yet:

- Framework runtime, compiler, adapter, or application behavior.

### Milestone 1 — Managed-Class Metadata and Decorator Definitions

Packages changed:

- `packages/core`

Implemented:

- Branded, runtime-validated namespaced class-kind and decorator identifiers.
- Generic immutable `ManagedClassKind` descriptors with independently configurable capabilities.
- Adapter-safe `defineManagedClassDecorator()` helper separated from class-kind meaning.
- Source-independent, runtime-ready managed-class metadata stored without Vite, AST, or platform objects.
- Public Core exports for all Milestone 1 contracts.

Tests added:

- Multiple extensible class kinds without a central enum.
- Stable/namespaced identifier validation.
- Independent `injectable` and `managedMethods` capabilities.
- Registry-managed but non-method-managed kinds.
- Adapter-defined kind/decorator creation using only public Core APIs.
- Decorator identity, class-kind meaning, and source-independent metadata separation.

Tests run:

- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @bunwire/core build`

Result:

- Passed. Cumulative root tests: 2 files, 9 tests.

Acceptance criteria:

- [x] Two class kinds can coexist without hard-coded enum changes.
- [x] Class-kind IDs are stable and namespaced.
- [x] `injectable` is independently configurable from `managedMethods`.
- [x] A class kind can be registry-managed but not method-managed.
- [x] Adapter-created class descriptors compile using only Core APIs.
- [x] Core contains no adapter-specific production class-kind IDs.

Expected behavior:

- Core can describe Service-like, Controller-like, Provider-like, and adapter-defined class kinds through one generic model.

Not expected yet:

- Built-in `Service`, `Controller`, or `Provider` definitions; those remain Milestone 3 work.

### Milestone 2 — Container, Bindings, Tokens, and Scopes

Packages changed:

- `packages/core`

Implemented:

- Unique typed runtime tokens and class-token identity.
- Explicit class, singleton, transient, value, factory, alias, and existing-instance bindings.
- Indexed constructor dependency metadata with validation and deterministic ordering.
- Recursive object-graph construction driven entirely by supplied runtime metadata.
- Per-container singleton caches and per-resolution transient creation.
- Alias resolution that preserves target singleton identity.
- Actionable missing-binding and circular-resolution errors with token chains.
- Deterministic last-binding-wins overrides with singleton cache eviction.
- Public Core documentation and exports for the Milestones 1–2 APIs.

Tests added:

- Token uniqueness, class-token use, and compile-time interface-only token rejection.
- Zero-argument, index-zero, multiple-position, out-of-order, and recursive class construction.
- Same-container singleton, cross-container singleton isolation, and transient lifetimes.
- Token-to-value, factory, class, existing-instance, and alias bindings.
- Explicit override and cached-singleton replacement behavior.
- Missing-binding and circular-resolution diagnostics.

Tests run:

- `pnpm quality`
- Public built-output import/resolution smoke test.

Result:

- Passed. Full quality suite: 3 files, 28 tests; workspace typecheck, boundary check, and all four package builds passed.

Acceptance criteria:

- [x] Custom tokens are unique even with equal descriptions.
- [x] Class constructors can act as runtime tokens.
- [x] Interface-only TypeScript types cannot accidentally become runtime tokens.
- [x] Zero-argument class resolves.
- [x] Constructor dependency index `0` resolves correctly.
- [x] Multiple constructor dependencies preserve positions.
- [x] Out-of-order dependency metadata creates correctly ordered arguments.
- [x] Singleton identity is stable within one container.
- [x] Separate root containers do not share singleton instances.
- [x] Transient bindings create a new instance per resolution.
- [x] Token-to-value, token-to-factory, and token-to-class bindings work.
- [x] Aliases preserve singleton identity.
- [x] Missing tokens produce actionable errors.
- [x] Runtime circular dependencies report the resolution chain.

Expected behavior:

- Given explicit metadata and bindings, Core constructs recursive object graphs without source analysis.
- Explicit bindings override earlier convention/default bindings deterministically.

Not expected yet:

- Automatic compiler discovery, built-in managed class registrations, child/invocation containers, or application lifecycle behavior.

## Important Decisions

- Built-in `Service`, `Controller`, and `Provider` class kinds remain deferred to Milestone 3.
- Framework-owned runtime entries are consistently named bindings; Provider lifecycle behavior remains deferred.

## Known Limitations

- Built-in managed class kinds, Provider lifecycle, the Application kernel, invocation scopes, compiler analysis, and adapters remain intentionally deferred to their documented later milestones.

## Next Work

- Milestone 3 — implement the built-in Service, Controller, and Provider kinds through the generic Milestone 1 metadata API.
