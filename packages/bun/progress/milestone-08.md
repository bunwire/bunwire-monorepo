# Milestone 8 — Authentication, OAuth Integration, and Authorization

Status: Complete

## Packages Changed

- `packages/bun`
- Bun example, tests, public-export audit, and documentation

## Implemented

- Added generic principal-aware session and bearer guards, eager request authentication, login/logout, exact named guard selection, and request-local caching.
- Added explicit global abilities and named policies with optional route-resource loaders and direct authorization APIs.
- Added canonical generated `auth`, `guest`, and `can` middleware contributions with startup validation.
- Added session-backed OAuth state/PKCE orchestration, one-time callbacks, application identity mapping, and standards-backed token exchange through `oauth4webapi`.
- Extended immutable session-store records with framework-owned metadata isolated from application values.
- Integrated auth, authorization, and OAuth contexts/tokens into Bun HTTP request scopes and Form Request authorization ordering.

## Remaining

- None.

## Acceptance Criteria

- [x] Anonymous and authenticated request contexts are deterministic.
- [x] Session and bearer guards support exact named selection without fallback.
- [x] OAuth state/PKCE flows map external identities into session authentication.
- [x] Abilities, named policies, direct checks, middleware, and Form Requests share one authorization engine.
- [x] No application User model, ORM assumption, runtime scanning, or compiler-managed policy class is introduced.
- [x] Public exports, documentation, example, and impact-based verification are current.

## Tests Added

- Authentication/session/bearer and direct authorization unit tests.
- Compiler tests for canonical aliases, direct identities, generated definitions, and collisions.
- HTTP runtime tests for eager auth, security middleware, named policies, login/logout, and Form Request ordering.
- OAuth tests for state, PKCE, replay rejection, identity mapping, session login, and standards-client exchange.
- A real Bun-process session-authentication and policy flow.

## Tests Run

- `node_modules\.bin\vitest.cmd run tests/bun/milestone-08 --config vitest.config.ts` (unit/compiler/runtime files)
- Real Bun process file separately with host filesystem access.
- `pnpm.cmd --filter @bunwire/bun test`
- `pnpm.cmd typecheck`
- `pnpm.cmd check:boundaries`
- `pnpm.cmd --filter @bunwire/bun build`
- `pnpm.cmd --filter @bunwire/example-bun-app build`
- `pnpm.cmd test:built-exports`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: focused non-process coverage, 4 files and 12 tests.
- Passed: real Bun security process, 1 file and 1 test.
- Passed: complete Bun package coverage, 24 files and 100 tests.
- Passed: workspace typecheck, package boundaries, Bun/example builds, generated example registry, and built-export audit.
- Failed: 0 after compatibility-fixture corrections.
- Known warnings: deliberate HTTP/session failure tests report their handled errors to stderr; Git reports the repository's existing LF-to-CRLF checkout warnings.

## Regression Checks

- Earlier compiler fixtures accept the canonical `csrf`, `auth`, `guest`, and `can` contributions without relying on generated import indexes.
- Milestone 3–4 process fixtures select only the routes those milestones own, preventing later example routes from changing their startup requirements.
- Core/Vite-facing generated metadata, package boundaries, declarations, public built exports, and the Bun example remain valid.

## Expected Behavior

After this milestone, Bun HTTP applications can authenticate arbitrary application principals, integrate OAuth providers, and authorize requests through reusable abilities and policies.

## Not Expected Yet

- Password storage, account models, remember-me cookies, MFA, OIDC, provider presets, or automatic OAuth routes.

## Important Decisions

- The default guard is eagerly resolved for synchronous request access.
- Session authentication stores only an application-defined serializable principal key.
- OAuth uses a standards-backed Authorization Code + PKCE flow.
- Authorization policies are explicit named runtime registrations.

## Known Limitations

- Real Bun child processes require normal host filesystem access in the managed test environment; the behavior passes outside that sandbox restriction.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 8 is complete. Milestone 9 is next.
