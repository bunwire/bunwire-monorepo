# Milestone 11 — Jobs, Queue Contracts, Serialization, and Dispatch

Status: Complete

## Packages Changed

- Core compiler contracts/canonical runtime authorization, Vite analysis/generation, Bun jobs/queues/scopes/runtime, Bun example, tests and documentation. No dependencies or versions changed.

## Decisions

- Explicit stable `@Job({ id })` identity; payload-only `handle()` with constructor DI.
- Literal protected queue/tries/timeout/backoff defaults are compiled, never read by constructing jobs.
- Explicit queue driver configuration; immutable fluent builders submit only through `dispatch()`.
- Versioned serialized envelopes and explicit lease-based at-least-once delivery.
- Generic compiler metadata contracts, without Bun branches in Core/Vite.

## Acceptance Criteria / Remaining

- [x] Canonical jobs, intrinsic handler plans, defaults, diagnostics, transient DI.
- [x] Typed dispatch, strict serialization, versioned envelopes and policy snapshots.
- [x] Sync execution and memory queue reservation/release/ack/failure semantics.
- [x] Adapter startup/shutdown integration and isolated job execution scopes.
- [x] Compiler, runtime, typed and real-process tests pass.
- [x] Example, public exports, architecture and progress documentation updated.
- [x] Impact-based regression checks and affected builds pass.

## Tests Run

- Initial focused Bun Milestone 11: 21 passed, 5 failed. Runtime failures exposed Core's unconditional method-decorator validation; adding generic intrinsic-method authorization rather than a Bun-specific exception.
- Initial Bun package build passed. Vite build exposed one callback typing error; corrected and Vite build passed.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-11/jobs-compiler.test.ts tests/bun/milestone-11/jobs-process.test.ts --config vitest.config.ts`: compiler 7 passed; process initially failed due to the fixture test path. Corrected path; focused process rerun passed (1 test, real Bun).
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-11/queues.test.ts --config vitest.config.ts`: first corrected run 20 passed, expanded lifecycle run 25 passed, re-entrant dispatch run 26 passed. Subsequent shutdown/custom serializer regressions are included in the passing final suite below.
- `pnpm.cmd typecheck`: passed after correcting callback typing and adding explicit `data: undefined` to a test plan; the final recheck after scope/fixture changes also passed.
- `pnpm.cmd check:boundaries`: passed.
- `pnpm.cmd --filter @bunwire/example-bun-app build`: initial generation/Vite/TypeScript build passed. Follow-up after clearer example job naming hit a Windows UNKNOWN file-open error on `.bunwire/registry.ts`; retry after concurrent checks remains.
- `node node_modules/vitest/vitest.mjs run tests/milestone-04 tests/milestone-05 tests/milestone-06 tests/milestone-08 tests/milestone-09 tests/milestone-10 tests/milestone-11 tests/milestone-14 --config vitest.config.ts`: 9 files / 152 tests passed.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-01 tests/bun/milestone-02 tests/bun/milestone-03/http-compiler.test.ts tests/bun/milestone-03/http-runtime.test.ts tests/bun/milestone-04/http-middleware-compiler.test.ts tests/bun/milestone-06/form-request-compiler.test.ts tests/bun/milestone-10 --config vitest.config.ts`: 11 files / 63 tests passed. Deliberate HTTP Date-result and thrown-route errors logged as expected; assertions passed.
- After admission-boundary changes: `node node_modules/vitest/vitest.mjs run tests/bun/milestone-11/queues.test.ts tests/bun/milestone-02 --config vitest.config.ts`: 2 files / 41 tests passed (27 queue and 14 scope tests).
- Focused custom serializer test: 1 passed, 27 intentionally filtered out; previously passing tests retained until the final package checkpoint.
- Final new milestone suite: `node node_modules/vitest/vitest.mjs run tests/bun/milestone-11 --config vitest.config.ts`: 3 files / 40 tests passed (29 runtime/serialization/driver, 10 compiler, 1 real Bun process), none skipped.
- Example build retry passed (generation, Vite 27 modules, TypeScript); no permissions or source workaround was needed for the transient Windows file-open error. Subsequent typecheck also passed.
- No full workspace suite, release/tarball/clean-install audits, or `pnpm quality` run, following impact-based execution instructions.

## Final Verification

- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-03/http-process.test.ts tests/bun/milestone-09/pages-process.test.ts --config vitest.config.ts`: 2 files / 2 tests passed. HTTP fixture now includes generated job classes/plans and an explicit sync driver; two `POST /api/jobs/native-job` requests returned canonical receipts and increasing audit counts. Existing HTTP 404/405/500, concurrent request isolation, pages, and clean shutdown passed.
- Final `pnpm.cmd typecheck`: passed, including affected package/project builds and typed dispatch assertions.
- Final `pnpm.cmd check:boundaries`: passed; no adapter semantics in Core/Vite, runtime scanning, globals for current execution, or cross-package source imports.
- `node tests/built-export-audit.mjs`: passed; Core's compiler contract and Bun's new runtime/type exports match the allowlist.
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo -c core.safecrlf=false diff --check`: passed.
- Bun behavioral runtime: `bun --version` = `1.3.14`.
- Final aggregate: **257 distinct tests passed** (40 new milestone tests, 152 Core/compiler/Electrobun, 63 Bun regressions, 2 example-backed native process tests). Scope tests rerun after admission changes are counted only once. No outstanding failures or unverified required behavior. Filtered exploratory runs are not treated as missing coverage; final milestone suite has zero skipped tests.
- Known warnings: intentional HTTP failure-boundary logging only. One transient Windows generated-file open error recovered on normal retry, with no permission bypass or dependencies changed.

## Tests Added

- Canonical/re-exported Job recognition, literal defaults, optional/default/rest payload plans, transient scope and constructor DI, stable identity duplication, fake decorators, invalid policy, constructor assignments, injected dependencies, and overload rejection.
- An unrelated fake adapter proves intrinsic `perform()` generation and literal metadata without Bun branches.
- Strict JSON round trips and rejection of lossy/native/class/array-subclass/accessor/cyclic values.
- Envelope/policy snapshots, overrides, immutable non-thenable builders, re-entrant/idempotent dispatch, missing configuration, registry validation and serializer identity/version/tuple validation.
- Sync scope/instance isolation, Provider boot, explicit disposal, error aggregation, shutdown admission/draining, partial-startup rollback, single-driver ownership, and signal cleanup ordering.
- Memory queue isolation, deterministic ordering, delayed availability, expiring/redelivered leases, stale lease fencing, attempts, release, ack and terminal failure.
- Generated-registry execution in an actual Bun child process and HTTP-to-job integration in the example-backed native process test.

## Package Integration

- Package remains `0.1.1`; no dependencies, manifests or lockfiles needed changes.
- Existing Bun test script targets `tests/bun`, automatically including Milestone 11.
- Core and Bun package READMEs, authoritative architecture, Bun roadmap, example, generated registry/declarations, export allowlist, and package/root progress indexes updated.
- Existing uncommitted work from prior milestones was preserved.

## Architectural Issues

- Core startup required own method-decorator metadata even for adapter-declared intrinsic handlers. Extend canonical descriptor validation and startup authorization only for declared class/kind/name combinations, preserving all other decorator checks.
- Initial intrinsic class compilation rejects inheritance and computed members so literal policy cannot diverge from generated metadata; job composition is through constructor DI.
- Adapter shutdown marks scope admission closing before waiting for HTTP/submission drain. Existing active runs continue; their disposal failures remain visible to both dispatch and Core shutdown. An internal scope-manager admission boundary avoids early scope disposal.

## Expected Behavior

Applications explicitly configure a driver and dispatch generated jobs with serialized payloads. Sync runs through Core invocation in an isolated Bun job scope; memory queues retain work until explicitly reserved. `POST /api/jobs/:id` in the example returns an immutable receipt and observable audit count after sync execution. Worker, scheduler and command roles still start no HTTP resources or background consumer loop.

## Intentionally Deferred

- Worker loops, retries, timeout enforcement, failed-job storage, queued listeners (Milestone 12).
- Durable drivers, distributed coordination and exactly-once guarantees.
- HTTP middleware is not a job middleware integration; job-specific worker execution policy remains later work. Job classes/policy inheritance and computed members are intentionally unsupported; use constructor-injected composition.

## Remaining / Next

- Nothing remains in Milestone 11.
- Next: Milestone 12 — Queue Workers, Retries, Timeouts, Failed Jobs, and Queued Listeners.

## Blockers

- None.
