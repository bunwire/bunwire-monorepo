# Milestone 10 — Events and Managed Listeners

Status: Complete

## Packages Changed

- `examples/bun-app`: Core event, listener, audit Service, and awaited HTTP dispatch endpoint.
- Bun integration tests and the existing example-backed HTTP fixture.
- Bun/Core architecture documentation and package/root progress indexes.
- No framework runtime/compiler source, public exports, dependencies, or versions changed for this milestone.

## Implemented

- Confirmed Core owns the canonical event registry, dispatcher, and invocation lifecycle.
- Started this progress record before implementation.
- Added a complete Bun compiler fixture, native-process coverage, runtime scope/replacement tests, and an observable example event route.

## Acceptance Criteria

- [x] Bun compilation preserves canonical event/listener identity, aliases, DI plans, and diagnostics.
- [x] Generated event plans remain separate from HTTP routes and caller contracts.
- [x] Bun runtime preserves sequential/fail-fast, zero-listener, nested, and concurrent dispatch.
- [x] Invocation-local dependency isolation and singleton listener defaults are verified.
- [x] Provider replacement of the dispatcher works without Bun interference.
- [x] Example demonstrates awaited HTTP-to-event dispatch and real Bun shutdown.
- [x] Focused regressions, typecheck, boundaries, example build, and documentation pass review.

## Tests Run

- `pnpm.cmd exec vitest run tests/bun/milestone-10 --config vitest.config.ts`: wrapper could not locate Vitest; used the installed runner with the same workspace configuration instead, without changing dependencies.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-10 --config vitest.config.ts`: initial run 14 passed / 4 failed (18 tests). Native process passed. Failures were test setup: explicit Providers were incorrectly placed into an incomplete generated registry, and fake-decorator expectations included Bun's built-in middleware. Corrected the helper to use `withProviders()` and assert only event/listener kinds.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-10/events-runtime.test.ts tests/bun/milestone-10/events-compiler.test.ts --config vitest.config.ts`: 2 files / 18 tests passed after those corrections and adding repeated-generation stability coverage. Together with the already-passing process test, all 19 Milestone 10 tests pass.
- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd check:boundaries`: passed.
- `pnpm.cmd --filter @bunwire/example-bun-app build`: passed (generation, Vite production build, and TypeScript build).
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-03/http-process.test.ts tests/bun/milestone-09/pages-process.test.ts --config vitest.config.ts`: 2 files / 2 tests passed, including the new example event endpoint and clean native shutdown.
- `node node_modules/vitest/vitest.mjs run tests/milestone-14 tests/bun/milestone-03/http-compiler.test.ts tests/bun/milestone-03/http-runtime.test.ts --config vitest.config.ts`: 4 files / 38 tests passed.
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo -c core.safecrlf=false diff --check`: passed.
- Final aggregate: 59 distinct tests passed (19 Milestone 10 tests and 40 focused regression tests), none skipped, no outstanding failures. Previously passing tests were retained rather than unnecessarily rerun.
- Expected diagnostics: the existing HTTP failure-boundary tests log unsupported-response and deliberate route-failure errors to stderr; their assertions passed.
- Full workspace tests, `pnpm quality`, release/tarball audits, and clean-install audits were not run: this milestone changes integration tests, the example, and documentation, not shared runtime/compiler behavior or package exports.

## Tests Added

- Full Bun bootstrap/compiler discovery fixture with Core decorator re-exports, events, aliases, nested listeners, constructor DI, Services, and HTTP Controllers.
- Canonical identity/diagnostic checks, bounded-graph rejection, exact generated relationships, empty caller contracts, and byte-stable regeneration.
- Sequential, fail-fast, no-listener, role-independent, nested/concurrent invocation isolation, explicit local listener bindings, singleton defaults, and recording-dispatcher replacement tests.
- Native Bun HTTP-to-event process test with generated registry, failure-to-500 propagation, no accidental listener routes, and actual process exit after Core shutdown.

## Regression Checks

- The example-backed HTTP fixture now preserves generated listener plans when selecting its subset of HTTP routes; page fixtures continue to select only their required classes/methods.
- Production page assets and page HTTP behavior still pass after the example gained events.
- No duplicate Bun event architecture or runtime discovery path was added.

## Decisions and Expected Behavior

- Core dispatch creates one root-parented invocation per event, with one Provider boot pass. It does not implicitly inherit HTTP request bindings.
- Listener defaults remain application-singleton. Explicit invocation-local listener/dependency bindings are supported through Provider boot.
- No parallel Bun event definitions, dispatcher, diagnostics, or execution-scope kind will be introduced.

## Not Expected Yet

- Queued listeners, serialization, retries, fan-out, alias dispatch, and fire-and-forget shutdown draining.

## Completion and Expected Working Behavior

- Core event/listener declarations compile and dispatch unchanged in Bun applications through the generated runtime registry.
- `POST /api/events/:id` in the example awaits `ExampleActionRecorded`, resolves its listener's audit Service through generated DI, and returns `{ id, deliveries }`.
- Events are not HTTP routes or caller-contract entries. Aliases remain secondary generated metadata rather than dispatch keys.
- Listener failures reach the caller unchanged (and the normal HTTP exception boundary when called from a route). Nested/concurrent dispatch and Provider-based test replacement work without globals or a Bun dispatcher wrapper.
- No architectural deviations or runtime/compiler implementation changes were necessary. Package version remains `0.1.1`.

## Remaining / Next

- Nothing remains in Milestone 10.
- Next: Milestone 11 — Jobs, Queue Contracts, Serialization, and Dispatch.

## Blockers

- None.
