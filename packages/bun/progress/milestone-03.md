# Milestone 3 — HTTP Routes and Native `Bun.serve()`

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `packages/bun`
- `examples/bun-app`
- compiler/runtime tests, public-export audit fixture, and architecture documentation

## Implemented

- Created the milestone progress record before implementation.
- Aligned the roadmap with the selected reuse of Core's canonical `Controller` class kind.
- Added `ManagedInvocationOptions.parentContainer`, including same-Application root validation, so Bun request-scope bindings flow into Core's invocation child.
- Added platform-neutral Vite metadata handlers for adapter-defined managed-method identity validation and method-kind-specific caller-contract exclusion.
- Added canonical `Get`, `Post`, `Put`, `Patch`, `Delete`, `Options`, `Head`, and `Context` decorators with exact compiler symbol identity.
- Added strict route normalization and validation for prefixes, paths, parameters, wildcards, caller-visible parameters, exact duplicates, and structural parameter conflicts.
- Added the frozen public `BunHttpContext`, HTTP runtime tokens, route metadata, native server types, and validated `BunAdapterOptions.http` configuration.
- Added generated-registry route consumption with no runtime source discovery.
- Added one native `Bun.serve()` host for the `http` role, grouped native method routes, deterministic 404/405 responses, and minimal native-Response/500 handling.
- Added isolated `http-request` execution scopes, Core Controller DI, explicit HTTP-context resolution, and native request/server/parameter access.
- Added graceful native server shutdown before execution-scope disposal, startup rollback, callback failure cleanup, and aggregated server/scope cleanup handling.
- Updated the Bun example, package documentation, architecture wording, generated registry, boundary checks, and public export allowlist.

## Remaining

- None.

## Acceptance Criteria

- [x] Canonical Bun HTTP decorators compile only on Core Controllers.
- [x] Invalid, duplicate, and structurally conflicting static routes fail compilation.
- [x] Generated route metadata drives native `Bun.serve()` with no runtime discovery.
- [x] Request context and controller DI resolve through isolated HTTP request scopes.
- [x] GET, POST, params, 404, 405, and minimal 500 behavior work in a real Bun process.
- [x] Non-HTTP roles start no server and HTTP resources stop through Core shutdown.
- [x] Public exports, example, package artifacts, and documentation are current.
- [x] Focused package suites, typecheck, build, boundaries, and built-export verification pass.

## Tests Added

- Core invocation-parent inheritance and foreign-root rejection coverage.
- Bun HTTP compiler fixtures for all verbs, canonical/counterfeit symbols, normalization, invalid paths, transport parameters, duplicate identities, generated registry metadata, and empty client output.
- Bun HTTP runtime tests for native options/callbacks, grouped routes, DI/context/request scopes, 404/405/500 results, registry rejection, and cleanup failures.
- Real Bun 1.3 process coverage for native GET/POST routing, parameters, request access, concurrent scope isolation, fallbacks, errors, and graceful shutdown.
- Updated Milestone 1/2 regression tests for the now-active default HTTP role.

## Tests Run

- `pnpm.cmd --filter @bunwire/bun test`
- `pnpm.cmd --filter @bunwire/core test`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd typecheck`
- `pnpm.cmd build`
- `pnpm.cmd check:boundaries`
- `pnpm.cmd test:built-exports`
- `pnpm.cmd --filter @bunwire/example-bun-app generate`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: 371 focused automated tests (Bun 38, Core 150, Vite 183)
- Passed: workspace typecheck and build
- Passed: package boundaries and built runtime/declaration export allowlists
- Passed: Bun example registry generation and final whitespace/error check
- Failed: 0
- Skipped: 0

## Regression Checks

- Existing Core lifecycle, DI, managed invocation, middleware, and event runtime suites pass.
- Existing Vite discovery, analysis, registry/client generation, middleware, virtual-module, and event compiler suites pass.
- Bun Milestones 1 and 2 lifecycle, signal, compiler, process, and execution-scope suites pass with the Milestone 3 HTTP default.
- Full-workspace, release-package, and clean-install suites were not rerun; the repository's test-running guidance for this completion used the focused affected-package suites and structural checks listed above.

## Expected Behavior

After this milestone, a generated Core Controller registry can start and serve native Bun HTTP routes with explicit request-context injection and isolated request scopes.

## Not Expected Yet

- Bun HTTP middleware integration.
- JSON/result normalization or replaceable exception rendering.
- Form Requests, sessions, authentication, pages, queues, scheduling, commands, or WebSockets.

## Important Decisions

- Bun reuses Core's canonical `Controller` class kind and contributes only HTTP method/runtime meaning.
- HTTP context is explicit through Bun `@Context()` and `BUN_HTTP_CONTEXT`.
- Native `Response` is the only successful result type until Milestone 5.
- Missing compiled methods return 405 with `Allow`; unknown paths return 404.

## Known Limitations

- Successful route results are native `Response` only until Milestone 5.
- HTTP middleware integration begins in Milestone 4.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 3 is complete.
