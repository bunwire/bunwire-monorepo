# Milestone 17 — Authorization Conveniences

Status: Complete

## Packages Changed

- `@bunwire/bun`
- Bun package integration tests and the committed release export allowlist.

## Implemented

- Added async `allows()` and `denies()` to request-scoped `BunAuthorizationContext`, both delegating to its existing `can()` evaluation.
- Added immutable `policy(name, resource?)` helpers with `allows()`, `denies()`, and `authorize()`. Explicit resources take precedence; omitting a resource preserves named route-parameter resolution.
- Exported the typed `BunAuthorizationPolicyCheck<Resource>` interface and updated the release declaration allowlist.
- Documented Controller/page, Form Request, and Service use in the Bun guide.

## Remaining

- None for Milestone 17.

## Acceptance Criteria

- [x] Common global and named-policy checks need no repeated lookup or denial boilerplate.
- [x] Existing `can()`, `authorize()`, `can` middleware, and Form Request authorization remain compatible.
- [x] Anonymous and missing ability/policy checks deny deterministically; malformed helper identifiers and assertion failures use the established error paths.
- [x] No Core concept, second policy registry, or runtime decorator scan is introduced.

## Tests Added

- `tests/bun/milestone-17/authorization-conveniences.test.ts`: global and named-policy checks, explicit-resource precedence, route fallback, anonymous/missing cases, malformed identifiers, assertion failures, and resource typing.
- Extended `tests/bun/milestone-08/security-runtime.test.ts` to compare direct named-policy checks, generated `can` middleware, and named-policy Form Request authorization for the same post; it also uses `allows()` for a global Form Request ability.

## Tests Run

- `pnpm exec vitest run tests/bun/milestone-17/authorization-conveniences.test.ts`
- `pnpm exec vitest run tests/bun/milestone-08/auth-authorization.test.ts tests/bun/milestone-08/security-runtime.test.ts`
- `pnpm exec vitest run tests/bun/milestone-08/security-runtime.test.ts` (after the named-policy Form Request case was added)
- `pnpm typecheck`
- `pnpm exec tsc -p tsconfig.tests.json --noEmit` (after the final integration-test change)
- `pnpm --filter @bunwire/bun build`
- `pnpm check:boundaries`
- `pnpm test:built-exports`

## Test Results

- Passed: Milestone 17 test file, 4/4 tests.
- Passed: two affected Milestone 8 files, 7/7 tests.
- Passed: final Milestone 8 security runtime rerun, 3/3 tests, and final test TypeScript typecheck.
- Passed: root build-graph and test TypeScript typecheck; Bun package build; package boundary check; built public runtime/declaration export audit.
- Initial export audit failed because the new public type was absent from its committed declaration allowlist. After adding it, the audit passed. No known test failures remain.

## Regression Checks

- Existing Milestone 8 `can()`/`authorize()` tests passed. HTTP integration verified the direct helper, generated `can` middleware, and named-policy Form Request each deny anonymous access and allow the authenticated owner of the same post; Form Request authorization still runs before validation.
- Existing package boundaries and public export checks passed. No Core/compiler change or broader suite rerun was needed.

## Expected Behavior

- Request authorization exposes async global allow/deny checks and a bound named-policy helper while preserving `can()`, `authorize()`, configured policies, and generated `can` middleware.
- Applications can pass explicit resources to policy checks or use the existing route resolver. Assertion failures remain HTTP 403.

## Not Expected Yet

- Typed policy configuration builders, managed policy classes, and ORM-based authorization conventions.

## Important Decisions

- Keep the existing manager as the single evaluator and retain its route-resource fallback and 403 assertion behavior. Validate names when creating a policy helper; unknown valid names deny access.
- Scope the new convenience API to `BunAuthorizationContext`; application-singleton services must not retain request-scoped authorization context.

## Known Limitations

- Policy and ability names remain runtime strings; this milestone does not infer a compile-time name map from adapter configuration. The helper's generic resource type reflects its explicit argument, not the configured policy map.

## Blockers

- None.

## Next

- Milestone 18 — HTTP input and response conveniences.
