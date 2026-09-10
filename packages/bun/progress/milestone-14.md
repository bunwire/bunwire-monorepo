# Milestone 14 — Commands and Bunwire CLI Runtime

Status: Complete

## Packages Changed

- `@bunwire/core`, `@bunwire/vite`, `@bunwire/bun`, and the Bun example.
- Package version remains `0.1.1`.

## Accepted Design

- Commands are compiler-discovered transient managed classes with constructor DI and an intrinsic `handle()` plan.
- `@Argument`, `@Option`, and `@Flag` parameter injectors define the generated CLI input plan.
- The command role starts feature hosts only when an operational command selects them.
- `runBunCli()` owns start/run/stop and returns an exit code without calling `process.exit()`.

## Implemented

- Added canonical transient `@Command()` classes with stable names, optional descriptions, constructor DI, intrinsic `handle()` plans, and compile-time duplicate/reserved-name validation.
- Added generated `@Argument()`, `@Option()`, and `@Flag()` resolver plans with names/descriptions, aliases, string/number/integer coercion, required/default values, literal choices, help text, and deterministic usage diagnostics.
- Extended Core's generic intrinsic-method compiler policy with exact resolver allowlists and an optional compiler-only parameter-plan validator. Vite remains platform-neutral and emits normal resolver plans while excluding command handles from generated clients.
- Added `BunCommandRuntime`, `BUN_COMMAND_RUNTIME`, frozen `BUN_COMMAND_CONTEXT`, injectable line-oriented IO, cancellation, isolated command scopes, explicit `0..255` handler results, and deterministic error rendering.
- Added `runBunCli()` as the start/run/stop boundary. It defaults to `Bun.argv.slice(2)`, always awaits Core shutdown, returns rather than forces the process exit code, and preserves cleanup failures.
- Added generated-registry-backed `help`, `list`, `routes:list`, `events:list`, `jobs:list`, `queue:failed`, `queue:retry`, `queue:forget`, `schedule:list`, and one-shot `schedule:run` operations.
- Added on-demand `serve` and `queue:work`. Command-role applications accept the corresponding HTTP/worker/scheduler options but start no feature host until the selected operational command requires it.
- Added one-shot scheduler execution and late worker creation through the existing scheduler, queue manager, Core invocation, and Bun execution-scope lifecycles.
- Added a separate generated command example with constructor DI and all three input decorators, plus package scripts and documentation.
- Updated architecture, package, roadmap, example, public-export, and progress documentation.

## Remaining

- None for Milestone 14.

## Acceptance Criteria

- [x] Canonical commands and input plans compile without runtime source scanning.
- [x] Application commands execute with DI in isolated command scopes.
- [x] Help, usage, output, errors, exit codes, and cleanup are deterministic.
- [x] Framework introspection and queue/schedule/host commands consume generated registries.
- [x] Real Bun-process behavior and impacted package regressions pass.

## Tests Added

- Compiler fixtures for canonical generation, constructor DI, resolver plans, fake decorators, invalid resolver use, duplicate commands, reserved names, and duplicate input names.
- Runtime tests for parsing/coercion/defaults/flags, help, usage and execution codes, frozen context, scope disposal failures, and command-role option validation.
- Framework-command tests for route/job/schedule introspection, due-schedule execution, failed-job list/retry/forget, and on-demand worker activation/draining.
- Real Bun-process tests for managed command output/exit codes, invalid usage, native HTTP serving, and signal shutdown.

## Tests Run / Results

- Final Milestone 14 suite: 4 files, 17 tests passed, 0 failed.
- Focused adapter/queue/command lifecycle regression: 4 files, 46 tests passed, 0 failed.
- Core intrinsic job and schedule compiler/runtime regression batch: 71 assertions ran; 69 passed and two stale expectations were identified. After updating them for the canonical schedule/command kinds and command-role worker configuration, the affected rerun passed 23/23 and the final compiler rerun passed 2/2.
- Full workspace test phase: 92 files, 701 tests ran; 699 passed and only the same two stale expectations failed. Both were subsequently corrected and individually verified as above; no implementation assertion remained failing.
- Final workspace TypeScript build graph and test typecheck passed with no diagnostics.
- All eight buildable workspace projects, generated examples, and Bun/Vite production client build passed.
- Package-boundary audit and built runtime/declaration export audit passed.
- Real command example ran successfully with generated DI and parameter plans.
- Known warning: Vite reports the existing unanalyzable Electrobun dynamic import during its invalidation test; this is unchanged and non-failing.

## Regression Checks

- Existing Bun adapter descriptor discovery includes request, job, scheduled-task, and command extensions canonically.
- Existing job dispatch, sync queues, worker settings/lifecycle, scheduled tasks, command-role shutdown, HTTP runtime, and generated example behavior remain green.
- Core and Vite accept existing payload-only/parameterless intrinsic methods while enforcing command resolver-only plans.
- Non-command roles retain their existing host startup behavior; command-role scheduler state stays idle until `schedule:run`.

## Expected Behavior

After this milestone:

- Generated application commands execute with constructor DI and parsed parameters in isolated command scopes.
- The CLI exposes stable help, IO, errors, and exit codes through a runner that completes Core cleanup before returning.
- Framework commands introspect generated routes/events/jobs/schedules and operate the implemented queue/scheduler facilities.
- Long-running HTTP and worker resources activate only for the selected command and stop through Core lifecycle/signal handling.

## Not Expected Yet

- Interactive prompts, shell completion, JSON output mode, variadic arguments, combined short flags, and WebSockets.

## Important Decisions

- Framework command names are reserved and cannot be shadowed by application commands.
- Usage errors return `2`; execution/startup/cleanup failures return `1`; successful handlers return `0` unless they explicitly return an integer exit code.

## Known Limitations

- CLI output is human-readable only. Interactive prompts, completion, environment inputs, variadic arguments, combined short flags, and JSON output remain deferred.
- Process-local queue/failed-job/lock implementations retain their documented durability and distribution limits.

## Blockers

- None.

## Next

- Milestone 15 — Bun WebSockets.
