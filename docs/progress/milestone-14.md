# Milestone 14 — Core Events and Managed Listeners

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- centralized tests, fixtures, generated artifacts, and documentation

## Implemented

- Created this progress record before implementation began.
- Added canonical Core Event and Listener class kinds/decorators, strict runtime target validation, internal managed listener-handle metadata, and public registry definition helpers/errors.
- Extended the runtime registry with identity-shared event definitions, listener definitions/handle plans, explicit relationships, and an alias index.
- Added the application-owned replaceable `EventDispatcher`, exact-constructor lookup, one invocation scope per dispatch, ordered sequential invocation, fail-fast behavior, zero-listener behavior, and nested/concurrent isolation.
- Added intrinsic compiler DI for `EventDispatcher` and normal listener constructor DI.
- Added canonical compiler extension aggregation, event alias analysis, listener target/handler analysis, new typed diagnostics, and deterministic event/listener generation.
- Updated generated registry source/virtual declarations and the Electrobun example artifact.
- Added Core runtime and compiler/generated behavioral test suites with valid and adversarial fixtures.
- Updated Core/package/architecture/test documentation and corrected the Bun roadmap to consume rather than duplicate Core events.

## Remaining

- None.

## Acceptance Criteria

- [x] Canonical `@Event()` and `@Listener(Event)` identities are compiler-authorized by symbol.
- [x] Events are payload identities, are not injectable, and require no `handle()` method.
- [x] Event aliases are optional, unique, deterministic, and never replace canonical class identity.
- [x] Listeners use constructor DI and a compiler-validated managed `handle(event)` invocation plan.
- [x] Generated registries contain canonical events, aliases, listeners, and ordered relationships.
- [x] Dispatch is exact-identity, sequential, fail-fast, re-entrant, and safe for zero/concurrent listeners.
- [x] Core remains platform-independent and queues remain deferred.
- [x] Required tests, typechecking, builds, generated-output inspection, and regressions pass.
- [x] Documentation and project-level progress are current.

## Tests Added

- `tests/milestone-14/events-runtime.test.ts` — definitions, identity, DI, sequential/failing/zero/nested/concurrent dispatch, Provider lifecycle, replacement, and malformed registries.
- `tests/milestone-14/events-compiler.test.ts` — canonical symbols, counterfeit defenses, aliases, handler diagnostics, inheritance, deterministic generation, semantic typechecking, behavioral execution, and scanning/name-identity boundaries.
- `tests/fixtures/milestone-14-events/*` — valid behavioral source and source-located invalid compiler cases.

## Tests Run

- Baseline `pnpm --filter @bunwire/core test`.
- Baseline `pnpm --filter @bunwire/vite test`.
- Focused `pnpm vitest run tests/milestone-14` and compiler-regression suites.
- Final `pnpm --filter @bunwire/core test`.
- Final `pnpm --filter @bunwire/vite test`.
- `pnpm check:boundaries`.
- `pnpm typecheck`.
- `pnpm build`.
- `pnpm test:built-exports`.
- `pnpm test`.
- `pnpm quality`.

## Test Results

- Passed baseline: Core — 11 files, 131 tests.
- Passed baseline: Vite/compiler — 16 files, 165 tests.
- Existing non-failing Vite warning: dynamic `electrobun/bun` import cannot be statically analyzed.
- Passed interim Milestone 14 suite: 2 files and 25 tests before the final diagnostic/registry additions.
- Passed final Milestone 14 suite: 2 files, 29 tests.
- Passed final Core suite: 12 files, 142 tests.
- Passed final Vite/compiler suite: 17 files, 183 tests.
- Passed final monorepo suite: 37 files, 375 tests.
- Passed full production/test typechecking, all five buildable workspace projects, package-boundary checks, Electrobun SDK contract verification, and built runtime/declaration export audits.
- Passed final `pnpm quality` with the same known non-failing Electrobun dynamic-import warning.

## Regression Checks

- Core and compiler production/test TypeScript projects compile.
- Electrobun and fake-queue applications build against the expanded runtime registry.
- Generated Electrobun physical registry now contains explicit empty event/alias arrays without platform changes.
- Generated event fixture source was inspected for exact constructor references, shared immutable definitions, ordered relationships, lexical aliases, stable hashes, and absence of runtime source scanning/class-name identity.
- New event/listener diagnostics were exercised at exact fixture locations, including spoofed symbols/IDs, invalid aliases, targets, classes, and handlers.

## Expected Behavior

After this milestone, Core owns compiler-backed event identity, managed listeners, direct sequential dispatch, aliases, and runtime registry lookup without source scanning.

## Not Expected Yet

- Queued listeners or Bun queue integration.
- Listener priorities or concurrent fan-out.
- Continue-after-error dispatch.
- String/alias-based dispatch, serialization, or external event transport.

## Important Decisions

- Milestone 14 is the next Core milestone; the separate Bun roadmap retains its own numbering.
- One invocation scope is created per event dispatch and shared by its ordered listener invocations.
- Listener classes use Bunwire's existing singleton default and binding precedence.
- Undecorated subclasses gain no Bunwire event/listener identity; a separately decorated listener may inherit a compatible concrete handler.

## Known Limitations

- None within the Milestone 14 contract. The existing Vite warning for the intentionally dynamic Electrobun native import remains non-failing and unrelated.

## Blockers

- None.

## Next Work Within This Milestone

- None. Future Bun work may add optional queued-listener integration while consuming this Core dispatcher and registry.
