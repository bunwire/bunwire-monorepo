# Milestone 6 — `@Request()` and Form Request Integration

Status: Complete

## Packages Changed

- `packages/validation`
- `packages/core`
- `packages/vite`
- `packages/bun`
- Bun example, tests, public-export audit, and documentation

## Implemented

- Created the milestone progress record before implementation.
- Locked the validation workspace import, composition-based Form Request design, and `query < body < route` input precedence.
- Imported the existing framework-independent validation package as the canonical `packages/validation` workspace package without changing its input-bound `ValidationRequest` contract.
- Added canonical `@Request()`, `BUN_REQUEST_KIND`, `FormRequest`, typed frozen source views, preparation/authorization hooks, request context access, and sync/async validation delegation.
- Added generic managed-class base-contract and managed-class parameter-resolver compiler metadata handlers without Bun-specific branches in Core or Vite.
- Extended resolver plans with optional exact runtime tokens and generated exact Request-class identities for Controller injection.
- Added generated-registry validation, request-scoped constructor DI, per-invocation instance reuse, lazy cloned-body parsing, deterministic source precedence, and centralized 400/403/422 failures.
- Added JSON, urlencoded, multipart, repeated-field, native File, async-rule, custom-message/attribute, projection, middleware short-circuit, and concurrency behavior.
- Updated the Bun example, architecture/roadmap/package documentation, workspace configuration, package boundaries, lockfile, and built-export allowlists.

## Remaining

- None.

## Acceptance Criteria

- [x] Canonical decorated Request classes enter the generated registry.
- [x] The compiler, rather than runtime inheritance scanning, decides managed Request identity.
- [x] Controller parameters resolve exact registered Form Request identities through request-scoped DI.
- [x] HTTP inputs, preparation, authorization, async validation, and projection behave deterministically.
- [x] Failed Form Requests never invoke Controllers and use the centralized exception pipeline.
- [x] Concurrent requests remain isolated.
- [x] Public exports, documentation, example, and focused verification are current.

## Tests Added

- Imported validation behavior/hardening tests under `tests/validation`.
- Form Request compiler fixtures for canonical discovery, exact resolver tokens, constructor DI, invalid bases, undecorated subclasses, and counterfeit decorators.
- Form Request runtime tests for all supported input sources, precedence, hooks, DI, reuse, projection, failures, middleware short-circuiting, and concurrency.
- A real Bun-process suite for JSON, multipart/File, async validation, native HTTP isolation, and graceful shutdown.

## Tests Run

- `pnpm.cmd --filter @bunwire/validation test`
- `pnpm.cmd --filter @bunwire/core test`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd --filter @bunwire/bun test`
- `pnpm.cmd typecheck`
- `pnpm.cmd --filter @bunwire/validation build`
- `pnpm.cmd --filter @bunwire/core build`
- `pnpm.cmd --filter @bunwire/vite build`
- `pnpm.cmd --filter @bunwire/bun build`
- `pnpm.cmd --filter @bunwire/example-bun-app build`
- `pnpm.cmd check:boundaries`
- `node tests/built-export-audit.mjs`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: validation package suite, 2 files and 30 tests.
- Passed: Core affected suite, 12 files and 150 tests.
- Passed: Vite/compiler affected suite, 17 files and 183 tests.
- Passed: complete Bun package suite, 15 files and 73 tests.
- Passed: workspace production/test typecheck.
- Passed: validation, Core, Vite, Bun, and generated Bun example builds.
- Passed: package boundaries and built runtime/declaration export allowlists, including validation.
- Passed: repository whitespace/error check.
- Failed: 0 after corrections.
- Skipped: 0.
- Expected warnings: Vite reports the existing unanalyzable Electrobun dynamic import; Milestone 3 intentionally reports unsupported/throwing route errors to stderr while asserting safe 500 responses.

## Regression Checks

- Core lifecycle, DI, managed invocation, middleware, and event suites remain green after adding optional resolver tokens.
- The complete Vite/compiler suite remains green after adding generic class-contract and parameter-resolver handlers.
- Bun Milestones 1–5 and their native process tests remain green after adding Request compiler contributions and changing the generated example route.
- The imported validation package retains all 30 original behavior/hardening tests.
- Full-workspace, release-package, tarball, and clean-install suites were not run under the impact-based verification policy.

## Expected Behavior

After this milestone, canonical `@Request()` classes can use constructor DI, receive isolated HTTP input/context, authorize and validate asynchronously, and arrive prepared in Controller methods.

## Not Expected Yet

- Sessions, CSRF, authentication managers/policies, pages, or storage-backed upload facilities.

## Important Decisions

- The validation package becomes an authoritative workspace package rather than an external local link.
- Bun `FormRequest` composes `ValidationRequest`; it does not change the validation library's constructor contract.
- Merged validation input uses `query < body < route` precedence.
- Form Request resolution happens only after middleware continues to the managed Controller invocation.

## Known Limitations

- JSON validation input requires a plain object root; nested JSON values are not deep-frozen.
- Multipart values remain native strings and Files; bracket/dot key coercion and storage-backed upload abstractions remain deferred.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 6 is complete. Milestone 7 is next.
