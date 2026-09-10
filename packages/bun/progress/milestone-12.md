# Milestone 12 — Queue Workers, Retries, Timeouts, Failed Jobs, and Queued Listeners

Status: Complete

## Packages Changed

- `@bunwire/bun`, `@bunwire/core`, `@bunwire/vite`, and `examples/bun-app` (HTTP and separate worker composition roots), with focused tests and public-export audit entries.
- Package version remains `0.1.1`.

## Accepted Design

- Automatic worker-role consumption, configurable concurrency (default one), fair polling, renewable fenced leases.
- Cooperative timeout cancellation; await actual handler settlement before disposal/retry. Graceful shutdown finishes active attempts while renewing leases.
- Explicit failed-job store, save before terminal removal, retained original records on retry.
- Supplementary `@Queue` on canonical Core listeners, explicit typed event codecs, generic Core/compiler attachment and listener-delivery contracts.
- Preserve v1 envelopes, generated identities, Core invocation/Provider behavior, bootstrap/entrypoint separation, and package boundaries.

## Acceptance Criteria / Remaining

- [x] Worker startup gating, fairness, concurrency, retry/backoff, cancellation and shutdown races.
- [x] Lease renewal/loss and stale-settlement safety; failed-job persistence and management.
- [x] Frozen attempt context, fresh job scopes/DI, cleanup and infrastructure error propagation.
- [x] Generic class attachments/compiler identity validation and Core listener-delivery interception.
- [x] Queued listener compilation, explicit codecs, ordered dispatch and transient attempt invocation.
- [x] Real Bun worker processes and test-only surviving broker proving kill/redelivery/restart behavior.
- [x] Worker/queued-listener examples, generated artifacts, public exports and documentation.
- [x] Focused tests, impacted Core/compiler/adapter regressions, typecheck, boundaries, affected builds and built-export audit.

## Implemented

- Core supplementary managed-class attachment definitions, own immutable metadata, both decorator orders, canonical runtime sidecar completeness/data validation and backwards-compatible missing sidecars.
- Bun Queue attachment on canonical Core Listener, shared job/listener ID namespace, typed synchronous codec definitions/configuration snapshots, exact-class reconstruction, ordered snapshots/submission and fresh transient selected-listener attempts (no event redispatch or caller-context inheritance).
- Generic adapter per-listener delivery interception preserving exact event/listener identity, ordered fail-fast direct dispatch, one invocation/Provider boot, owned single-use continuations and dispatcher replacement.
- Generic Vite canonical attachment discovery/placement/inheritance validation, literal metadata, deterministic sidecar generation and cross-class-kind identity handlers. A non-Bun fake adapter proves the compiler mechanism. No new class kind or platform branch was added to Core/Vite.

- Optional backwards-compatible QueueDriver renewal capability; memory renewals retain fencing tokens/attempts, never shorten expiry, and reject expired/stale operations.
- FailedJobStore contracts and non-durable MemoryFailedJobStore, immutable/idempotent records, bounded serializable aggregate/cause diagnostics without invoking getters.
- QueueManager failed-job list/get/retry/forget/flush, retained original records, fresh immediate retry IDs/attempt resets.
- Store initialization/ownership/rollback and independent driver/store close attempts with combined failures.
- Frozen BUN_JOB_CONTEXT available before Provider boot/constructor DI, explicit BunJobFatalError, internal invalid-payload classification.
- Shared scoped attempt execution: cooperative timeout aborts, actual settlement before cleanup, synchronous elapsed-time overrun detection, combined handler/cancellation/disposal errors; sync never retries or persists terminal failures.
- Updated Bun README, roadmap, Core/compiler architecture and built public-export allowlist for worker and queued-listener APIs.
- Automatic worker role with validated/frozen queue names, concurrency/poll/lease settings; exact BUN_QUEUE_WORKER binding during preparation and cancellable next-turn startup gated on Core running.
- Fair bounded consumer loop, fresh scoped attempts, retry/backoff/fatal/invalid/exhaustion policy, save-before-remove, renewal through disposal/persistence and renewal quiescence before settlement.
- Infrastructure and lost-lease failures reject worker.done and trigger Core shutdown without awaiting a cyclic stop; graceful shutdown finishes active work, releases late reservations, attempts scope cleanup even if draining failed, and removes signals last.
- Migrated old dispatch-only fixtures to command role; actual worker-role regression cases explicitly configure a capable memory driver.
- Scope execution no longer yields on an absent configuration callback: accepted sync jobs enter Core's managed boundary before an immediately subsequent stop. A failing regression first reproduced the admission race, then passed with the smallest Bun-owned fix (no Core invocation/lifecycle change).
- Real Bun child fixture consumes a compiler-generated registry and uses explicit context injection/Provider boot. A parent-process test broker survives child SIGKILL, proving expiry/redelivery on a second worker using the same generated artifact. Signal tests request the first signal through the child's stdin/process.emit bridge for Windows portability and verify actual native re-raise only after acknowledgement and driver close.
- The HTTP example has separate direct/queued audits with an explicit codec. The isolated worker example has its own generated registry, retries a job, reconstructs a private-state event, observes worker completion and always stops through Core. Generation/build scripts cover both composition roots without a new workspace dependency or package version change.

## Tests Added

- Core generic extension work: `tests/milestone-14/class-attachments.test.ts` and `adapter-delivery.test.ts` cover supplementary metadata/sidecars, canonical registration, both decorator orders, identity preservation, one-invocation ordered listener delivery, continuation ownership/errors and explicit dispatcher replacement.
- `tests/milestone-14/class-attachments-compiler.test.ts` and `tests/fixtures/milestone-14-attachments`: nine non-Bun generic compiler proof cases.
- `tests/bun/milestone-12/queued-listeners.test.ts`: ten runtime cases for private state, ordered snapshot/no fan-out, transient DI, caller-context isolation, retry/disposal, codec validation/terminal persistence/decode timeout, submission failure and dispatcher replacement.
- `tests/bun/milestone-12/queued-listeners-compiler.test.ts`: four cases for canonical Core reuse/re-exports/decorator order, defaults/policy/generated sidecars, duplicate job/listener IDs and invalid/fake decorators.
- `tests/bun/milestone-12/codec-types.test.ts`: inferred event/payload types and compile-time negative contracts for async encoding and wrong reconstructed types.

- `tests/bun/milestone-12/queue-foundations.test.ts`: seven renewal/store/management/ownership/rollback tests.
- `tests/bun/milestone-12/job-attempts.test.ts`: six context/isolation/cooperative timeout (including Provider boot)/combined failure/synchronous-overrun/immediate-stop tests.
- `tests/bun/milestone-12/queue-worker.test.ts`: 17 tests for startup/validation, fairness/concurrency, retries and terminal persistence, actual failed-job retry/redelivery, cooperative timeout, slow cleanup/persistence renewal, in-flight renewal quiescence, late reservation release, lost leases, driver/store infrastructure failure and graceful signal/resource ordering.
- `tests/bun/milestone-12/worker-process.test.ts`: four real Bun tests for compiled retry/DI/cleanup, SIGINT, SIGTERM, and broker-backed kill/restart/redelivery. Test fixtures live under `tests/fixtures/bun-milestone-12-worker` and `tests/bun/milestone-12/fixtures`.
- `tests/bun/milestone-12/examples-process.test.ts`: two real Bun generated-example tests. Total newly added coverage: 69 tests (51 Bun and 18 generic Core/compiler), all passing across the recorded impact-based runs.

## Tests Run / Results

- Final impacted command: `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/examples-process.test.ts tests/bun/milestone-03 tests/bun/milestone-04/http-middleware-process.test.ts tests/bun/milestone-05/http-pipeline-process.test.ts tests/bun/milestone-06/form-request-process.test.ts tests/bun/milestone-07/session-process.test.ts tests/bun/milestone-08/security-process.test.ts tests/bun/milestone-09/pages-process.test.ts tests/bun/milestone-10/events-process.test.ts tests/bun/milestone-11/jobs-process.test.ts tests/milestone-03 tests/milestone-04 tests/milestone-05 tests/milestone-07 tests/milestone-08 tests/milestone-09 tests/milestone-10 --config vitest.config.ts`: initially 131 passed, three failed (19 files). Two consumers shared an HTTP fixture copying the example registry without its new attachment sidecar/codec; the new example event fixture also omitted its alias index. Fixed fixture composition to preserve those canonical generated records. No production validation was weakened.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-03/http-process.test.ts tests/bun/milestone-04/http-middleware-process.test.ts tests/bun/milestone-12/examples-process.test.ts --config vitest.config.ts`: four passed; all three prior failures resolved. Together with unchanged passing files, all 134 tests in the final impacted checkpoint pass. Unrelated passing tests were not rerun.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queue-worker.test.ts -t "consumes an explicit retry" --config vitest.config.ts`: one passed, 16 filtered. The new test initially advanced less than the configured polling interval; corrected its fake clock and separated acknowledgement from the memory driver's internal terminal removal. It proves fresh-ID/attempt-reset execution, successful acknowledgement and original-record retention/forgetting.
- Hardened rejection of invalid asynchronous codecs so rejected Promises are observed rather than causing unrelated unhandled rejections; queued-listener suite passed again (10 tests).
- `pnpm.cmd typecheck`: passed with final codec hardening and example/generated changes.
- `node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit`: passed after the last retry test and fixture changes; previously passing package builds were not repeated for test-only edits.

- Final acceptance gap tests added: queued-listener retry/disposal/fresh DI and caller binding isolation, invalid codec terminal persistence, synchronous decode timeout, asynchronous decoder rejection, and timeout during Provider boot.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queued-listeners.test.ts tests/bun/milestone-12/job-attempts.test.ts tests/bun/milestone-01/bun-adapter.test.ts --config vitest.config.ts`: 25 passed.
- `pnpm.cmd --filter @bunwire/example-bun-app build`: passed; generates separate HTTP and worker registries, production pages and TypeScript output.
- `pnpm.cmd --filter @bunwire/example-bun-app worker:demo`: passed against Bun 1.3.14, logging one queued listener and job attempt 2, then exiting cleanly.
- Generated-example process coverage passes for worker bootstrap/entrypoint and independent direct/queued HTTP-example audits.
- Boundaries and built-export allowlists passed with final supplementary attachment/interceptor and queued-listener/codec APIs.

- `node node_modules/vitest/vitest.mjs run tests/milestone-14/class-attachments.test.ts tests/milestone-14/adapter-delivery.test.ts tests/milestone-14/events-runtime.test.ts tests/milestone-06/adapter-extension.test.ts --config vitest.config.ts`: 50 passed (nine new generic-contract tests and 41 existing Core regressions).
- `node node_modules/vitest/vitest.mjs run tests/milestone-14/class-attachments-compiler.test.ts --config vitest.config.ts`: nine passed, including unrelated-adapter proof and cross-kind duplicate identity validation.
- A typecheck found one test constructor explicitly supplying an undefined exact-optional interceptor; fixed to omit that optional field. The generic extension checkpoint subsequently passed typecheck.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-11/jobs-compiler.test.ts tests/milestone-14/events-compiler.test.ts tests/milestone-11/electrobun-adapter.test.ts --config vitest.config.ts`: 43 passed after the generic Core/compiler changes.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queued-listeners.test.ts --config vitest.config.ts`: seven passed.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queued-listeners-compiler.test.ts tests/bun/milestone-11/jobs-compiler.test.ts --config vitest.config.ts`: 14 passed with Bun Queue contributions and shared class identity validation.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/codec-types.test.ts tests/bun/milestone-12/queued-listeners.test.ts tests/bun/milestone-10/events-runtime.test.ts tests/bun/milestone-01/bun-adapter.test.ts tests/bun/milestone-11/queues.test.ts --config vitest.config.ts`: 53 passed.
- Codec helper typechecking initially found TypeScript's generic constructor/InstanceType constraint mismatch. Using a constructor constraint with inferred InstanceType preserves exact public event/payload types without a cast; typecheck and negative codec type tests now pass.

- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queue-foundations.test.ts tests/bun/milestone-11/queues.test.ts --config vitest.config.ts`: 36 passed.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12 tests/bun/milestone-11/queues.test.ts --config vitest.config.ts`: initially 39 passed, one failed because invalid-payload wrapping hid the useful argument-count diagnostic. Fixed by retaining its safe message and original cause.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/job-attempts.test.ts tests/bun/milestone-11/queues.test.ts --config vitest.config.ts`: 33 passed after the diagnostic fix. Foundation tests were not rerun for an unrelated message-only fix.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-01/bun-adapter.test.ts tests/bun/milestone-02/execution-scopes.test.ts --config vitest.config.ts`: 23 passed; verifies affected adapter initialization/rollback and execution-scope shutdown behavior.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queue-worker.test.ts --config vitest.config.ts`: initial 12 worker tests passed.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/queue-worker.test.ts tests/bun/milestone-11/queues.test.ts tests/bun/milestone-01/bun-adapter.test.ts tests/bun/milestone-02/execution-scopes.test.ts tests/bun/milestone-10/events-runtime.test.ts --config vitest.config.ts`: 75 passed (16 worker, 29 queue, 23 adapter/scope, 7 direct event regressions).
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/job-attempts.test.ts -t "immediate stop" --config vitest.config.ts`: initially one failing, four filtered tests; proved the scope admission race.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/job-attempts.test.ts tests/bun/milestone-12/queue-worker.test.ts tests/bun/milestone-02/execution-scopes.test.ts --config vitest.config.ts`: 35 passed after the admission fix.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/worker-process.test.ts --config vitest.config.ts`: four passed against real Bun and a surviving parent broker.
- `node node_modules/vitest/vitest.mjs run tests/bun/milestone-12/worker-process.test.ts tests/bun/milestone-10/events-compiler.test.ts --config vitest.config.ts`: 15 passed (four process tests after watchdog hardening, 11 affected event/compiler fixtures after role migration).
- Intermediate checkpoint: 216 distinct relevant tests passed (62 new and 154 existing regressions), before the seven additional acceptance tests and final impacted checkpoint above.
- `pnpm.cmd typecheck`: passed after correcting two intentional malformed-error test inputs to explicitly cross the typed record boundary. Initial check failed only on those two test annotations.
- `pnpm.cmd typecheck`: passed again after the worker/role/process-fixture changes.
- `pnpm.cmd check:boundaries`: passed.
- `node tests/built-export-audit.mjs`: passed for all built public runtime/declaration allowlists (using the build produced by typecheck).
- Boundaries and built-export audit passed again with QueueWorker and its public types/token.
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo -c core.safecrlf=false diff --check`: passed.
- Initial read-only inspection confirms extensive pre-existing uncommitted work; unrelated changes remain preserved.

## Final Regression Checks and Warnings

- Relevant Core managed-class, Application lifecycle, invocation, adapter and event suites; generic compiler discovery/constructor/method/registry generation; dependent Electrobun adapter; Bun scopes, queues, direct events and real HTTP/middleware/response/Form Request/session/auth/pages/job processes passed in the recorded runs.
- Typecheck builds all referenced workspace packages and checks tests; the affected Bun example also passed generation, production Vite build and TypeScript build. Built public runtime/declaration exports and package-boundary checks passed at the final checkpoint.
- Expected stderr: deliberate unsupported-response and thrown-route cases log through the default Bun HTTP reporter while asserting 500 behavior. No unresolved failures or build warnings.
- Full workspace tests, `pnpm quality`, release/tarball and clean-install audits were not repeated: focused coverage plus the broader impacted checkpoint follows the requested impact-based policy.

## Expected Working Behavior

- A worker-role Application with a capable explicit driver automatically consumes generated jobs and queued Core listeners, with bounded concurrency, fresh scope/DI, cooperative timeout, retries, lease renewal and terminal records.
- Failed jobs can be inspected, retried under a new ID and forgotten/flushed; selected queued listeners preserve serialization identity and never fan out again.
- Core stop drains accepted attempts, disposes resources, closes queue/store and removes signals. Infrastructure or lease loss fails worker completion/Core shutdown; surviving external backends can recover expired work after process death.
- `pnpm --filter @bunwire/example-bun-app worker:demo` runs the generated example after its build and exits cleanly.

## Intentionally Not Expected Yet

- Scheduling (Milestone 13), command/queue CLI runtime, built-in durable queue/store backends, distributed transactions/exactly-once execution, forced in-process cancellation, and HTTP middleware for jobs.

## Important Decisions and Limitations

- Supplementary class attachments have their own generic descriptor contributions and optional/default-empty RuntimeRegistry.classAttachments sidecar. They never replace Event/Listener records or define a second managed class kind. Legacy decorators cannot reject a never-managed plain class until compilation/generated-record validation because the outer managed decorator may not have run yet; both valid orders are supported, with compiler placement validation required.
- Adapter eventListenerDelivery interception preserves canonical event validation and one Provider-boot/invocation per direct dispatch. Direct continuations are single-use and cannot escape the event lifecycle; already-started continuations are awaited even if the interceptor omits await, preserving distinct errors.

- No hard kill of in-process JavaScript. Ignored aborts may delay graceful shutdown.
- Default memory queue/store are process-local and non-durable; restart tests must use a broker surviving the child process.
- No scheduling, CLI, built-in durable drivers, process isolation, or HTTP middleware for jobs.
- Impact-based verification only; no routine full quality/release/tarball/clean-install audit.

## Blockers

- None.

## Remaining / Next Work

- No remaining Milestone 12 implementation or acceptance work. Next: Milestone 13 — Scheduling and Scheduled-Task Runtime.
