# Milestone 16 — Production Hardening, Testing Utilities, Documentation, and Compatibility Freeze

Status: Complete

## Packages Changed

- `packages/bun`, `examples/bun-app`, generated example registry, workspace Vitest configuration, Bun tests, and progress documentation.

## Implemented

- Milestone opened after Milestone 15 completion.
- Added instance-local HTTP cookie/CSRF/WebSocket client, recording event dispatcher, recording memory queue driver, and deterministic scheduler tick helper under `@bunwire/bun/testing`.
- Added optional structured operation records for HTTP, listener delivery, job attempts, schedules, commands, WebSocket upgrades/connections/messages, and a request ID on HTTP context.
- Extended the Bun example with a protected combined route, generated authenticated WebSocket, and an opt-in in-process memory worker for the executable integrated demo.
- Hardened Form Request file/error maps against special object keys by using null-prototype records.
- Rejected accessor and malformed array page props before copying them; the prior `page()` constructor spread could execute an accessor.
- Extended the worker example to demonstrate both successful retry and terminal failure-store recording; added the generated command to the behavioral check.
- Added a Bun-focused performance sanity command and a security review with behavior/test evidence.

## Remaining

- None for Milestone 16. Versioning and publication were outside the requested freeze-and-verify scope.

## Acceptance Criteria

- [x] Major subsystems work together without hidden special cases: real Bun process and generated scheduler/worker integration tests pass.
- [x] No known architectural rewrite is needed for ordinary additive features: Core retains generic managed/invocation boundaries and Bun owns host behavior.
- [x] Public APIs and persisted protocols were intentionally reviewed and pinned by compatibility and release/export audits.
- [x] Documentation matches tested behavior across package, example, security, and architecture guides.
- [x] All Bun milestone progress files 1–16 are complete.
- [x] Package progress marks the implementation complete and identifies only additive future work.

## Tests Added

- `tests/bun/milestone-16/testing.test.ts` covers client isolation/CSRF, event and queue recordings.
- Extended Milestone 3 HTTP runtime tests to verify request-ID correlation and lifecycle records.
- `tests/bun/milestone-16/example-process.test.ts` verifies the integrated example through a real Bun server and browser-style Bun WebSocket client.
- `tests/bun/milestone-16/scheduler-worker.test.ts` verifies generated schedule dispatch to a live memory worker and structured job records.
- `tests/bun/milestone-16/compatibility.test.ts` pins kind IDs, roles, generated-registry fields, queue/page versions, package entrypoints, and the session store surface.
- Extended page tests to reject accessor/sparse props without invoking getters and worker-example tests to assert terminal failure behavior.
- Extended event/listener, command, and WebSocket tests to assert observation records and failure outcomes.

## Tests Run

- `pnpm exec tsc -b packages/bun --pretty false` — passed after testing and observability edits.
- `pnpm exec vitest run --config vitest.config.ts tests/bun/milestone-16/testing.test.ts` — 2 passed after correcting one malformed test queue policy.
- Focused existing HTTP/event/queue/scheduler/command/WebSocket tests plus new testing tests — 58 passed.
- Focused HTTP and testing rerun after request-ID assertion — 8 passed.
- Real Bun WebSocket process regression — 1 passed.
- `pnpm --filter @bunwire/example-bun-app generate` and `typecheck` — passed.
- Integrated example process test — 1 passed.
- Scheduler-to-worker integration test — 1 passed after waiting for the completed job-observation boundary.
- `pnpm typecheck` — passed after updating HTTP context fixtures and the scheduler helper's structural type.
- `pnpm build` and `pnpm check:boundaries` — passed across affected workspace packages.
- `pnpm test:built-exports` — passed after the new public type and testing-entry allowlist was deliberately updated.
- Milestone 16 compatibility/testing/scheduler tests — 7 passed in latest combined rerun.
- Integrated example process test including command, HTTP security/page/worker/WebSocket paths — 2 passed in latest rerun.
- Milestone 12 worker example test including retry and terminal failure — 2 passed.
- Milestone 6 Form Request and Milestone 9 page security tests — 11 passed after accessor fix.
- `pnpm test` — 725 passed, 3 failed in 99 files. The three failures were stale test fixtures after adding the example WebSocket class. Their focused rerun passed 4/4 after correction. The full suite was not repeated because the fixture changes could not affect unrelated passing tests.
- `pnpm --filter @bunwire/bun test` — 56 files, 292/292 passed after the fixture corrections.
- Focused WebSocket process/identity and integrated example rerun after the final WebSocket observation fix — 11/11 passed.
- Focused event/listener and command runtime rerun after observation assertions — 12/12 passed.
- `pnpm performance:sanity:bun` — passed.
- `pnpm test:release-pack` and `pnpm test:clean-install` — passed, including isolated consumer import of `@bunwire/bun/testing` and frozen-install workspace typecheck.
- `pnpm --filter @bunwire/example-bun-app build` — passed and restored the generated production page manifest after Vite tests.
- `pnpm exec tsc -b packages/bun --pretty false` and `pnpm typecheck` — passed after the final source/test edits.

## Test Results

- All latest affected checks above passed. The first testing-helper run failed because the test fixture supplied a scalar rather than the documented backoff array; the fixture was corrected.
- The scheduler/worker test initially observed handler completion before the worker's end record settled; it now awaits the end record and passes.
- Compatibility assertions were aligned with the actual canonical `bun.request` kind and `eventAliases` registry field; the worker-role assertion now supplies its required reservable driver.
- The first page-accessor regression test exposed that `page()` copied props before validating them; the constructor now validates and snapshots first, and the affected tests pass.
- Bun performance sanity measurements in a representative local run: 30 routes 71.7 ms, 20 Form Requests 61.7 ms, 20 event dispatches 50.1 ms, and a generated scheduler tick 5.5 ms; explicit broad ceilings pass.
- Latest representative performance run: 30 routes 86.8 ms, 20 Form Requests 119.6 ms, 20 event dispatches 82.3 ms, worker drain 321.6 ms, scheduler tick 5.9 ms; 20 WebSocket messages stayed below the 10 s ceiling. Route requests include middleware and request-scope creation.
- Latest affected reruns and the complete Bun package suite have zero failures. The broad workspace suite's three fixture failures were each corrected and rerun successfully; the impact-based test rule precluded rerunning unrelated passing suites.

## Regression Checks

- Compiler fixtures, generated registries, HTTP/security, queue/worker, scheduler, command, WebSocket, page/Vite, shutdown, and scope-isolation tests ran in the complete Bun package suite. Dependent example builds and workspace typecheck/build, boundaries, built exports, release pack, and clean install passed.
- The Milestone 15 Vite watcher cleanup rejection did not recur in the workspace or Bun package run.

## Compatibility Review

- Retained canonical decorator names and managed class/method kind IDs; no adapter-specific Core or generic compiler branch was added.
- Reviewed generated registry fields and invocation metadata. New entries correspond to declared example routes, WebSockets, and jobs without changing the schema.
- Retained versioned queue envelopes and page protocol at version 1; compatibility tests pin these fields.
- Retained public exception, session-store, and runtime-role contracts. Compatibility, built-export, and release-pack tests pin their exposed surfaces.
- Exposed the testing subpath and observation hook/record types; kept the observation implementation internal. No known unstable internal API became public.

## Expected Behavior

- The Bun example runs a protected HTTP-to-event/queued-listener/job/worker path, page navigation and validation flash, authenticated WebSockets, the managed command, and graceful shutdown.
- Per-application hooks emit structured operation records without exposing bodies, credentials, sessions, or queue payloads.

## Not Expected Yet

- A version bump or published release. Additional stores/drivers, OAuth providers, distributed locks, and richer WebSocket/command/page conveniences are additive future work.

## Important Decisions

- Compatibility freeze and verification will not bump or publish the package version.
- The observability implementation class stays internal; only its hook/record types and adapter option are public. Test helpers are isolated in `@bunwire/bun/testing`.
- The integrated example's in-process memory worker is an opt-in demo; separate deployment roles require an application-supplied shared driver.

## Known Limitations

- No architectural conflict or package-boundary violation was found. The Milestone 15 Vite watcher cleanup rejection did not recur during verification.
- Bun 1.3.14 on Windows can leave native `server.stop(true)` pending after WebSocket close callbacks; existing bounded shutdown and real process exit pass.
- Performance checks use broad local sanity ceilings, not throughput guarantees.

## Blockers

- None.

## Next Work Within This Milestone

- None.
