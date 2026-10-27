# Bunwire CLI and Scaffolding Milestones

Status: Milestones 23–25 complete; Milestones 26–28 planned.

Architecture: [README.md](README.md). Project roadmap: [MILESTONES.md](MILESTONES.md). Status index: [progress.md](progress.md).

These are project milestone numbers, separate from the `@bunwire/bun` package milestones. This document defines target behavior and acceptance criteria; it does not imply the commands already exist.

## Goal

Give a Bunwire application one discoverable `bunwire` command for artifact generation, inspection, source generation, and Bun application operations, then provide a small project creator. Keep compilation static: project tooling must not import or execute the application just to discover metadata.

## Existing foundation

- `@bunwire/vite` exposes `generateBunwireArtifacts()` for physical `.bunwire` output. Vite already watches project inputs and recovers when a missing project-local import is created.
- `@bunwire/bun` exposes `runBunCli()` and compiler-discovered `@Command()` handlers. Its built-in application commands are `help`, `list`, `serve`, `routes:list`, `events:list`, `jobs:list`, `queue:work`, `queue:failed`, `queue:retry`, `queue:forget`, `schedule:run`, and `schedule:list`.
- The Bun and Electrobun examples use `bunwire generate` for physical artifacts. The Bun command example supplies its own command-role bootstrap and `runBunCli()` entrypoint.

## Command model

`@bunwire/cli` owns the executable and project tooling. `@bunwire/vite` continues to own analysis and artifact generation. `@bunwire/bun` continues to own host operations and custom managed commands. The executable must preserve the existing `runBunCli()` path rather than reimplementing HTTP, queue, scheduler, command parsing, or Provider lifecycle inside the tooling package.

The tooling commands must run on the repository's supported Node toolchain so an Electrobun-only project does not need Bun just to generate or inspect artifacts. Bun application operations require Bun: the CLI launches the selected command-role entrypoint as a Bun child process, forwards arguments and standard streams, relays termination, and returns its exit code. It never imports that entrypoint into the tooling process.

| Command family | Planned commands | Execution boundary |
|---|---|---|
| Discoverability | `bunwire help`, `bunwire list` | Show project tooling and, when a command-role Bun app is configured, available application commands. Help must work before project creation. |
| Artifacts | `bunwire generate`, `bunwire watch` | Use the public `@bunwire/vite` analysis/generation boundary. Never execute application modules or Providers. |
| Read-only project inspection | `bunwire routes:list`, `events:list`, `listeners:list`, `jobs:list`, `schedule:list`, `providers:list`, `controllers:list`, `services:list`, `middleware:list`, `commands:list` | Analyze configured source and adapter contributions without starting the Application. Read compiled facts, not inferred runtime bindings. |
| Source generation | `bunwire make:controller`, `make:service`, `make:provider`, `make:middleware`, `make:event`, `make:listener`, `make:job`, `make:schedule`, `make:command` | Create typed source files within configured project roots; do not execute generated code. |
| Bun application operations | `bunwire serve`, `queue:work`, `queue:failed`, `queue:retry`, `queue:forget`, `schedule:run`, and custom `@Command()` names | Dispatch through the configured Bun command-role entrypoint and `runBunCli()`; normal startup, Provider lifecycle, and runtime backends apply. |
| New project | `create-bunwire` and a discoverable `bunwire new` entry where practical | Copy a maintained template into a new destination; no application startup. |

The existing Bun `routes:list`, `events:list`, `jobs:list`, and `schedule:list` runtime commands remain available to direct `runBunCli()` integrations. The new executable presents compiler-backed read-only listings. Both paths must agree on the same generated definitions; any shared normalization or formatting contract belongs in its owning package and is exposed through a public entrypoint. Adapter-specific route, job, and schedule semantics remain owned by their adapters. The generic CLI and compiler must not introduce Bun- or Electrobun-specific branches.

`providers:list` lists discovered managed Provider classes and any explicitly configured Provider references that static analysis can establish. It must not claim to list the bindings created by `Provider.register()`. `listeners:list` gives a listener-oriented view of generated event relationships; `events:list` keeps the event-oriented view. `commands:list` reports managed command definitions, while `list` is the full CLI command catalog. `schedule:list` reports compiled schedules, not which occurrence will run next against live lock or timezone state.

Project tooling names and built-in Bun command names are reserved in the unified executable. Collision checks must identify the conflicting name and its owner. Custom application commands are dispatched through the runtime path only after resolving the intended project entrypoint. An application without a Bun command-role entrypoint can still use generation, inspection, and source generation.

## Cross-cutting rules

- Resolve one explicit project root, defaulting to the current working directory. Support a documented `--root` option; each invocation addresses one Bunwire config. Multi-root repositories call the command once per root. Never silently scan upward into an unrelated project.
- Reuse `bunwire.config.*`, TypeScript program resolution, source-root boundaries, canonical symbols, and existing diagnostics. Neither CLI inspection nor `make:*` may infer managed status from class names or folder names alone.
- Resolve the current `@bunwire/vite` peer-dependency packaging before publishing the CLI: a non-Vite project must be able to install and run compiler-only commands without installing Vite. Prefer a public compiler/generator subpath and an optional Vite peer if that preserves the established package boundary; document a separate compiler package only if a concrete dependency conflict requires it.
- Compiler-backed commands may load the established compiler descriptors and metadata handlers but must not import the application bootstrap, call policy callbacks, instantiate managed classes, or run Provider lifecycle methods.
- Keep generated artifacts under the configured application's ownership. Preserve the generator's write-only-if-changed behavior. Failed analysis must leave the last successful artifacts untouched and exit unsuccessfully.
- Output must be deterministic and script-friendly. Human-readable tables are the default; `--json` is required for inspection commands with a documented, stable envelope. Diagnostics go to stderr and failures return a nonzero exit code. Do not print secrets, request data, session records, or Provider-created values.
- `make:*` must check destination containment, reject overwrites by default, validate identifiers and path segments, and leave existing files intact on a failed operation. File and import conventions come from the selected template/profile, not from Core semantics.
- Generators should create complete, compiling examples of the intended managed type while avoiding placeholder runtime behavior presented as working functionality. A `make:schedule` target may use Bun's direct `@Schedule()` form; generating an entry in a compile-only `withSchedule()` block requires an explicit, separate safe-edit design.
- Core remains platform-independent. The CLI may depend on public compiler/tooling APIs; optional adapter-specific templates and inspection descriptions are owned by the adapter or an adapter-aware template package, never by private source imports.
- The sibling `validation` repository and durable storage driver packages are outside this track.

## Sequence

| Project milestone | Name | Status | Principal deliverable |
|---|---|---|---|
| 23 | Executable and physical generation | Complete | `@bunwire/cli`, root resolution, `help`, `list`, `generate` |
| 24 | Standalone watch lifecycle | Complete | `watch` with dependency invalidation and missing-import recovery |
| 25 | Compiler-backed project inspection | Complete | Static list commands, JSON output, runtime-list agreement |
| 26 | Core source generators | Planned | Controller, Service, Provider, Middleware, Event, Listener |
| 27 | Bun source generators and command dispatch | Planned | Job, Schedule, Command, Bun runtime operation bridge |
| 28 | Project scaffolding and release hardening | Planned | Maintained starters, end-to-end use, documentation and package checks |

## Milestone 23 — Executable and Physical Generation

**Goal:** Replace handwritten `generate.mjs` scripts for a single configured project without changing generated formats.

**Scope:** Publishable `@bunwire/cli` package with a `bunwire` binary; help and command catalog; project-root resolution; `bunwire generate [--root path]`; compiler diagnostics and exit codes. Preserve the programmatic API. Use public compiler/generator exports and existing configuration; do not add a second analyzer or runtime application import. Resolve the Vite peer-dependency gate so this command installs in a non-Vite consumer.

**Required tests:** binary invocation from a temporary installed/linked consumer without Vite; valid Bun and Electrobun fixtures; identical artifacts and hashes to the API; unchanged files retain their modification times; invalid config and compiler errors return nonzero without rewriting successful artifacts; root resolution does not escape into a neighboring project.

**Exit criteria:** examples can replace their single-root generation calls with the binary; multi-root example scripts can invoke it once per root; public package build, typecheck, and dependent example checks pass.

## Milestone 24 — Standalone Watch Lifecycle

**Goal:** Regenerate physical artifacts as supported inputs change, with the same recovery behavior established for Vite.

**Scope:** `bunwire watch [--root path]` watches config, bootstrap, managed source roots, page inputs, consumed project-local dependencies, re-export intermediates, and unresolved project-local import/re-export candidates after failure. Recompute the watched dependency set after success; ignore generated outputs; serialize refreshes; close watchers cleanly. Share reusable dependency/recovery logic with `@bunwire/vite` instead of copying Vite internals into the CLI.

**Required tests:** add/change/delete under managed roots; imported helper outside a managed root changes metadata but is not auto-discovered as a managed class; add a missing imported helper after a failed refresh and recover without another source edit; retain last successful artifacts through failure; no loop from generated output; repeated edits converge to the latest result; shutdown releases watchers.

**Exit criteria:** standalone Bun and Electrobun development can keep physical artifacts current without a Vite server or custom watcher.

## Milestone 25 — Compiler-Backed Project Inspection

**Goal:** Let developers inspect the compiled application graph without starting a host or running Providers.

**Scope:** Implement the read-only commands in the command model, with deterministic human output and `--json`. Expose a narrow public compiler inspection result containing source locations and canonical identities where available. Adapter-contributed pure descriptions provide adapter-specific labels and details. List actual managed records and generated relationships; never fabricate runtime bindings or queue/lock state. Existing direct Bun runtime list commands remain compatible.

**Required tests:** Bun routes, jobs, schedules, commands, and queued/direct listeners; Core Providers, Services, Controllers, Events, and Middleware; Electrobun and generic adapter contributions; empty results; import aliases and duplicate display names; no application or Provider side effects; runtime-versus-compiler list agreement for shared fields; JSON schema and stable ordering; actionable diagnostics for invalid source.

**Exit criteria:** all planned inspection commands work from the project root before application startup, and adapter extension tests prove the generic inspector has no concrete-adapter branch.

## Milestone 26 — Core Source Generators

**Goal:** Create valid managed source files with conventions that agree with Core discovery and lifecycle.

**Scope:** Implement `make:controller`, `make:service`, `make:provider`, `make:middleware`, `make:event`, and `make:listener`. `make:middleware` creates a real Core `@Middleware()` class and documented `handle` signature; optional alias and attachment guidance must distinguish definition from activation. Provider templates use `register()`/`boot()` correctly and call container entries bindings. Listener generation requires an explicit target Event reference; it must not guess an Event identity. Generated files belong under configured source roots and use package public imports.

**Required tests:** each generated file compiles and is discovered by the existing compiler when appropriately configured; middleware has valid invocation shape; Listener resolves to the chosen canonical Event; naming/path validation; conflicts and overwrite protection; Bun and Electrobun application fixtures; no bootstrap edits or startup side effects.

**Exit criteria:** the six generators produce usable source, with accurate instructions for any explicit policy attachment the developer must add.

## Milestone 27 — Bun Source Generators and Runtime Dispatch

**Goal:** Complete the commonly requested Bun managed types and connect operational commands to the existing Bun runtime.

**Scope:** Implement `make:job`, `make:schedule`, and `make:command` from public Bun APIs. The schedule generator creates a direct `@Schedule()` class with a valid cron expression; it does not silently rewrite `withSchedule()` callbacks. The command generator creates an unreserved name and valid `handle` signature. Define a documented command-role entrypoint convention or explicit `--entry` selection, then launch that entrypoint under Bun for `serve`, queue operations, `schedule:run`, and custom `@Command()` names. The entrypoint calls the application's existing `runBunCli()` boundary. Forward arguments, standard streams, signals, and exit codes without a shell. Do not start an application to serve `make:*`, `generate`, `watch`, or inspection commands.

**Required tests:** compiler discovery and generated registry contents for every generated kind; runnable generated Bun fixtures; duplicate/reserved command diagnostics; valid runtime operation dispatch and exit-code propagation, including signals and arguments; invalid/missing entrypoint diagnostics; no duplicate application startup; generic and Electrobun tooling continues without a Bun runtime dependency.

**Exit criteria:** the unified executable offers Artisan-style generation and application commands while preserving the existing Bun command execution contract.

## Milestone 28 — Project Scaffolding and Release Hardening

**Goal:** Create small projects that immediately use the CLI and pass their own build/typecheck steps.

**Scope:** Provide `create-bunwire` (and `bunwire new` if the package/executable layout makes it reliable) with Bun HTTP and Electrobun starters based on maintained examples. Offer choices for project name, package manager, and starter only where each path has a tested result. Generated projects use separate bootstrap/startup files, a valid Bunwire config, physical generation where needed, normal package imports, and commands documented by the CLI. Do not bundle production storage backends or pretend an in-memory backend coordinates multiple instances.

**Required tests:** scaffold each starter into a temporary path, install using the supported package-manager fixture or an equivalent local workspace resolution, generate, typecheck, build, and run a small smoke path; invalid names/destinations and nonempty target protection; Windows path and shell behavior; packaged binary contents and public entrypoints; documentation command examples; final impact-based cross-package quality checkpoint.

**Exit criteria:** a new project can be created, generated, inspected, built, and run using documented commands, without a custom `generate.mjs` script. Record exact results in `docs/progress/milestone-28.md` and mark the project index complete only after all track criteria pass.

## Progress and completion discipline

Create `docs/progress/milestone-23.md` when Milestone 23 work begins and one dedicated file for each later milestone as it begins. Update `docs/progress.md` at each status transition. A milestone is complete only when its implementation, acceptance tests, affected package checks, documentation, and progress record agree. Run focused tests after each change, expand by impact, and reserve the broad shared-compiler checkpoint for the appropriate final verification stage.
