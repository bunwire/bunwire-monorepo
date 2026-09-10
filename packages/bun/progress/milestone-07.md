# Milestone 7 — Sessions, Cookies, Flash State, and CSRF

Status: Complete

## Packages Changed

- `packages/core`
- `packages/vite`
- `packages/bun`
- Bun example, tests, public-export audit, and documentation

## Implemented

- Added a first-class generic adapter compiler contract for canonical external middleware definitions and exact public compiler symbols.
- Added Bun's canonical `CsrfMiddleware` with the built-in `csrf` alias, exact class references, collision checks, and ordinary generated Core middleware definitions.
- Added native-cookie-backed `BunCookieJar`, queued response cookies, reserved framework cookie protection, and secure session cookie defaults.
- Added signed opaque server-side session IDs, pluggable `SessionStore`, `MemorySessionStore`, immutable validated records, expiry, and serialized same-session request lifecycles.
- Added session get/set/remove/clear, regeneration, invalidation, destruction, flash/consume, and explicit old-input facilities.
- Bound cookie, session, manager, and CSRF identities into the correct Core application/request containers without global request context.
- Added session-bound HMAC CSRF tokens, explicit rotation, safe-method exemptions, header/form verification, and central 419 handling.
- Integrated session commit after middleware, response resolution, and rendered exceptions; store failures use the central exception pipeline and emit no partial session cookie.
- Preserved graceful shutdown ordering so active session commits settle before execution-scope cleanup completes.
- Updated the generated Bun example, package/architecture documentation, progress indexes, and public export allowlists.

## Remaining

- None.

## Acceptance Criteria

- [x] Sessions load and commit through the complete HTTP lifecycle.
- [x] Signed cookies, regeneration, invalidation, destruction, flash, and old input behave deterministically.
- [x] Same-session requests serialize while unrelated sessions remain concurrent.
- [x] The canonical `csrf` alias and direct class identity compile without Bun-specific Vite branches.
- [x] Safe methods bypass verification and unsafe header/form requests pass or fail through the central exception pipeline.
- [x] Native Bun HTTP restores browser-like session state and shuts down cleanly.
- [x] No ORM, SQL layer, runtime discovery, or global request context was introduced.
- [x] Public exports, documentation, example, and focused verification are current.

## Tests Added

- Session/store/cookie tests for validation, manager-only construction, secure defaults, signed-ID tampering, restoration, rotation, invalidation, destruction, flash, old input, isolation, locking, and multiple response cookies.
- Compiler tests for the canonical alias, direct class identity, generated runtime definition, and application alias collisions.
- HTTP runtime tests for eager validation, sessionless-CSRF startup rejection, safe methods, header/form verification, query/JSON rejection, store failures, and shutdown commit draining.
- A real Bun-process test for signed cookie restoration, flash state, CSRF success/failure, and graceful stop.

## Tests Run

- `node_modules\.bin\vitest.cmd run tests/bun/milestone-07 --config vitest.config.ts`
- `pnpm.cmd --filter @bunwire/core test`
- `pnpm.cmd --filter @bunwire/vite test`
- `pnpm.cmd --filter @bunwire/bun test`
- Targeted reruns of Vite and Bun-process files affected by compatibility/fixture corrections.
- `pnpm.cmd typecheck`
- Core, Vite, Bun, and Bun example builds.
- `pnpm.cmd check:boundaries`
- `node tests/built-export-audit.mjs`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: Milestone 7 focused suite, 4 files and 14 tests.
- Passed: Core affected suite, 12 files and 150 tests.
- Passed: complete Vite/compiler coverage, 17 files and 183 tests after targeted correction reruns.
- Passed: complete Bun package coverage, 19 files and 87 tests.
- Passed: workspace production/test typecheck.
- Passed: Core, Vite, Bun, and generated Bun example builds.
- Passed: package boundaries and built runtime/declaration export allowlists.
- Passed: repository whitespace/error check; line-ending notices are informational.
- Failed: 0 after corrections.
- Expected warning: the deliberate failing-store test is reported by the default HTTP exception reporter while asserting its safe 500 response.
- Full-workspace, release-package, tarball, and clean-install suites were not rerun under the impact-based verification policy.

## Regression Checks

- Core's lifecycle, DI, managed invocation, middleware, and event suites remain green.
- Vite's affected compiler suite remains green after adding backward-compatible external middleware definitions.
- Bun Milestones 1–6 remain green; the two native example-registry process fixtures were updated for the newly compiled session route and pass.
- Built public exports and the generated Bun example remain deterministic and buildable.

## Expected Behavior

After this milestone, a Bun HTTP application can opt into secure server-side sessions, mutate request-scoped state, flash data for one later request, and protect unsafe routes with generated `csrf` middleware.

## Not Expected Yet

- Authentication, OAuth, authorization, server-driven pages, Redis/database stores, secret key rings, or automatic validation redirects.

## Important Decisions

- Browser cookies contain a signed opaque ID; all session state remains server-side.
- Session setup is an HTTP host boundary, while CSRF verification is explicitly attached canonical Core middleware.
- Session cookies default to `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`; plain-HTTP development must opt out of `Secure`.
- Same-session request lifecycles serialize through commit to prevent lost updates.
- CSRF accepts a header or urlencoded/multipart form field, never query or JSON values.
- External middleware contributions are backward-compatible optional adapter compiler metadata.

## Known Limitations

- `MemorySessionStore` is process-local and intended only for development/tests.
- One signing secret is supported; multi-key rotation is deferred.
- Old input is explicit and JSON validation failures do not automatically redirect or flash request bodies.

## Blockers

- None.

## Next Work Within This Milestone

- None; Milestone 7 is complete. Milestone 8 is next.
