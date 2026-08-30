# Milestone 4 — HTTP Middleware Runtime

Status: Complete

## Packages Changed

- `packages/bun`
- Bun example, tests, public-export audit, and documentation

## Implemented

- Created the milestone progress record before implementation.
- Fixed the public filtering contract: `only`/`except` use uppercase HTTP methods and `include`/`exclude` match the actual URL pathname.
- Added the frozen public `BunMiddlewareContext` extending the native HTTP context with pathname, method, transport, and attachment parameters.
- Added Bun-specific case-sensitive path-pattern compilation with segment `*`, full-segment `**`, include/exclude precedence, and query/fragment exclusion.
- Added startup validation for uppercase HTTP method filters, malformed patterns, and generated attachments without runtime middleware definitions.
- Added HTTP middleware selection and Core `executeMiddlewareChain()` integration through the existing managed invocation `around` boundary.
- Preserved one request execution scope and one Core invocation scope across Provider boot, transient middleware DI, parameter resolution, and Controller execution.
- Added before/after execution, native Response short-circuiting, parameter-distinct attachments, skipped-construction behavior, and concurrent request isolation.
- Added Bun compiler fixtures proving aliases, parameters, groups, nested groups, mappings, canonical `@Use()`, ordering, deduplication, and invalid policy diagnostics.
- Updated the generated Bun example with global parameterized middleware, HTTP filters, response headers, and a method-level short circuit.
- Updated package/architecture documentation, the roadmap contract, public type-export audit, and test documentation.

## Remaining

- None.

## Acceptance Criteria

- [x] Bun HTTP middleware uses Core's canonical middleware definitions and generated attachments.
- [x] Actual-path and uppercase-method filters are validated and applied deterministically.
- [x] Middleware DI, before/after execution, short-circuiting, and parameters work in the request invocation.
- [x] Global policy, mappings, groups, `@Use()`, ordering, and deduplication are proven through Bun compiler fixtures.
- [x] Concurrent requests retain isolated request and invocation scopes.
- [x] Public exports, example, documentation, and focused verification are current.

## Tests Added

- Bun compiler-policy fixtures for four-scope ordering, aliases, nested groups, parameter parsing, mapping resolution, exact deduplication, and canonical symbol authorization.
- Bun compiler failures for duplicate aliases, alias/group ambiguity, cycles, unresolved references, and counterfeit `@Use()`.
- Runtime coverage for immutable context, actual-path/method filtering, DI, Provider-boot bindings, nesting, short circuit, skipped construction, malformed definitions, and concurrent isolation.
- Real Bun 1.3 process coverage for generated middleware headers, GET/POST filters, parameters, and native short-circuit response.

## Tests Run

- `pnpm.cmd --filter @bunwire/bun test`
- `pnpm.cmd typecheck`
- `pnpm.cmd --filter @bunwire/bun build`
- `pnpm.cmd --filter @bunwire/example-bun-app build`
- `pnpm.cmd check:boundaries`
- `pnpm.cmd test:built-exports`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: 56 focused Bun automated tests across 10 files
- Passed: workspace production/test typecheck
- Passed: Bun package and generated example builds
- Passed: package boundaries and built runtime/declaration export allowlists
- Passed: final whitespace/error check
- Failed: 0
- Skipped: 0

## Regression Checks

- Bun Milestones 1–3 lifecycle, execution-scope, compiler, HTTP runtime, and native-process suites pass with middleware enabled in the generated example.
- The Bun compiler tests execute the real generic Vite middleware analysis and registry generator under `BUN_COMPILER_DESCRIPTOR`.
- Full-workspace, release-package, and clean-install suites were not run under the agreed focused milestone verification policy.

## Expected Behavior

After this milestone, generated Core middleware attachments execute around Bun HTTP Controllers in the same managed request invocation.

## Not Expected Yet

- JSON/result normalization or replaceable exception rendering.
- Built-in session, CSRF, authentication, authorization, or throttling middleware.

## Important Decisions

- `BunMiddlewareContext` extends the existing HTTP context and adds actual pathname, uppercase method, `transport: "http"`, and immutable attachment parameters.
- Path patterns use the established case-sensitive `*`/`**` segment grammar and ignore query/hash components.
- Identical target-plus-parameter attachments remain deduplicated by the existing compiler; parameter-distinct attachments execute separately.

## Known Limitations

- Middleware must return or eventually produce a native `Response` until Milestone 5.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 4 is complete.
