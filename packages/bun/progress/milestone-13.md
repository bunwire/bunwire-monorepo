# Milestone 13 — Scheduling and Scheduled-Task Runtime

Status: Complete

## Packages Changed

- `@bunwire/core`, `@bunwire/vite`, `@bunwire/bun`, and the Bun example.
- Package version remains `0.1.1`.

## Accepted Design

- Core owns platform-neutral, compile-only `Application.withSchedule()` declarations and generated schedule records.
- Bun owns `@Schedule`, cron/timezone behavior, scheduler execution, scheduled-task scopes/context, locking, and queue dispatch.
- Five-field minute cron, UTC default, current-minute startup evaluation, missed-run skipping, report-and-continue failures.
- Central job schedules accept compiler-safe static JSON arguments.
- Renewable fenced local overlap locks; distributed-capable provider required for single-server schedules.

## Implemented

- Added Core's compile-only `Application.withSchedule()` surface and immutable `RuntimeScheduleDefinition` records to the generated runtime registry. Core validates schedule shape, unique identity, and canonical generated targets without interpreting Bun cron behavior.
- Added a generic adapter-provided application-schedule compiler contract and Vite analysis for direct fluent schedule blocks. The compiler recognizes canonical task/job classes, validates payload arity, accepts deterministic JSON literals (including negative numbers), emits stable source-relative IDs, and keeps server-only task handles out of generated clients.
- Added canonical `@Schedule()` transient managed tasks with compiler-generated constructor/parameterless `handle()` plans and optional protected literal policy (`id`, `timezone`, overlap modes, and lease duration).
- Added standard five-field cron parsing with wildcard/list/range/step syntax, month/weekday names, Sunday `0`/`7`, IANA timezone evaluation, standard day-of-month/day-of-week OR semantics, and deterministic invalid-expression errors.
- Added `BunScheduler`, `BUN_SCHEDULER`, injectable clock/error-policy options, current-minute startup execution, absolute-minute duplicate prevention, missed-minute skipping, and report-and-continue or explicit stop-on-failure behavior.
- Added isolated transient direct-task invocation through `scheduled-task` scopes and frozen `BUN_SCHEDULE_CONTEXT`; scheduled jobs snapshot/validate their static JSON arguments at registry consumption and use the existing typed `QueueManager` and `queue-job` lifecycle.
- Added renewable fenced `ScheduleLockProvider` contracts and process-local `MemoryScheduleLockProvider`. Local overlap prevention works without external infrastructure; single-server schedules require stable IDs and an explicitly distributed-capable provider. Default timezone and lease duration remain unresolved in generated records so adapter defaults apply correctly.
- Added single-Application lock-provider ownership, initialization rollback, exactly-once close, active-work draining, reverse-order lock release, cleanup error aggregation, and scheduler-first Bun adapter shutdown before queue/scope cleanup and signal removal.
- Added a separate generated scheduler example that runs both a direct task and a centrally configured job, plus real Bun-process graceful signal coverage.
- Updated architecture/package/roadmap documentation, generated artifacts, public export allowlists, and root/package progress indexes.

## Remaining

- None for Milestone 13.

## Acceptance Criteria

- [x] Compiler-backed direct scheduled tasks and central schedules.
- [x] Due-time, timezone, DST, missed-run and duplicate-tick semantics.
- [x] Scheduled jobs and isolated direct-task execution.
- [x] Overlap and distributed single-server extension contracts.
- [x] Failure reporting and graceful scheduler shutdown.
- [x] Runnable generated scheduler example and required verification.

## Tests Added

- Core compile-only configuration and runtime schedule-record validation.
- Compiler fixtures for canonical decorated/central schedules, generated output stability, static job arguments, fake decorators, invalid targets/arity/cron, and forbidden application syntax.
- Runtime coverage for due/non-due work, UTC and adapter/per-schedule timezones, DST fallback, skipped missed minutes, isolated frozen contexts, scheduled jobs, failure policies, overlap, distributed capability, lease outcomes/defaults/fencing/renewal/expiry, provider ownership/rollback, and graceful shutdown.
- Real Bun-process coverage for generated direct/job execution and SIGTERM cleanup while scheduled work is active.

## Tests Run / Results

- Milestone 13 plus Core schedules: 4 files, 28 current tests passed across the final focused checkpoints, 0 unresolved failures.
- Impacted Milestone 11 queue regression: 3 files, 40 tests passed, 0 failed.
- Impacted Milestone 12 worker/queued-listener regression: 8 files, 51 tests passed, 0 failed.
- Middleware computed-policy compatibility rerun: 2 targeted tests passed, 0 failed; the other 40 tests in that suite had already passed before the exact failing diagnostic case was restored.
- Core/Vite/Bun/example builds and the repository test TypeScript project passed with no diagnostics.
- Example artifact generation passed; both checked-in scheduler records use stable source-relative imports/IDs.
- Built runtime/declaration export audit passed for all release packages.
- Package-boundary audit passed.
- A single combined 15-file regression invocation reported all 114 assertions passing but exited nonzero because Vitest's worker progress RPC timed out. The same coverage was split into the clean passing checkpoints above; no assertion failure was hidden.

## Regression Checks

- Existing job dispatch, queue serialization, sync/memory drivers, worker retry/timeout/lease behavior, failed-job management, queued Core listeners, and real worker processes remain green.
- Existing computed/optional `withMiddlewares()` diagnostics remain green after adding schedule policy analysis.
- Non-scheduler roles continue to ignore generated schedule records and start no scheduler resources; the scheduler role starts neither HTTP nor a queue worker.

## Expected Behavior

After this milestone:

- Exported `@Schedule("...")` tasks and centrally configured job/task schedules compile into the runtime registry without executing the bootstrap callback.
- A scheduler-role entrypoint evaluates the current minute, runs matching direct tasks with DI in isolated scopes, or dispatches matching jobs through the configured queue driver.
- UTC, configured IANA timezones, missed minutes, DST repetition, overlap leases, user failure reporting, and graceful shutdown have explicit deterministic behavior.
- Distributed deployments can supply a durable `ScheduleLockProvider` without changing scheduler APIs; the built-in provider never claims a distributed guarantee.

## Not Expected Yet

- Managed commands/CLI operations, WebSocket runtime, built-in Redis/SQL locks or queues, seconds-level cron, cron macros, catch-up/replay, conditional schedules, and before/after/success hooks.

## Important Decisions

- Core owns only declarations and immutable registry records; Bun owns all execution and time/lock semantics.
- Generated records preserve omitted timezone/lease values so `BunSchedulerOptions` supplies real runtime defaults.
- Single-server completion claims are part of the distributed provider contract; successful claims must survive release long enough to fence the same schedule/minute occurrence.
- Schedule lock providers, like queue drivers/stores, belong to exactly one Application lifecycle.

## Known Limitations

- `MemoryScheduleLockProvider` is process-local and intentionally rejected for `onOneServer()`.
- Graceful shutdown waits for cooperative active scheduled work; it does not forcibly terminate arbitrary user promises.

## Blockers

- None.

## Next

- Milestone 14 — Commands and Bunwire CLI Runtime.
