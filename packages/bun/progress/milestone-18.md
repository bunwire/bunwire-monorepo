# Milestone 18 — HTTP Input and Response Conveniences

Status: Complete

## Packages Changed

- `@bunwire/bun`
- `@bunwire/validation`

## Implemented

- Signed URL manager with HMAC-SHA256 canonical method/path/ordered-query signing, optional expiry, relative output, explicit trusted absolute origin, and `signed` middleware.
- Request and application scope `BUN_SIGNED_URLS` service; signed middleware fails closed through HTTP 403 and requires signing configuration at startup.
- Request scoped pagination with bounded `page`/`perPage`, offset, metadata, and relative links preserving filters.
- Pure Web `File` rules (`file`, `maxFileBytes`, `mime`) in `@bunwire/validation`, available to Bun Form Requests without a second validator.
- Package docs, generated compiler alias fixture, HTTP integration tests, and updated public export allowlist.

## Remaining

- None.

## Acceptance Criteria

- [x] Signed URLs bind method/path/query and reject tampering or expiry through the HTTP exception path.
- [x] Pagination parses bounded page input and preserves filters without a persistence dependency.
- [x] File rules compose with Form Requests and preserve JSON/page validation behavior.
- [x] Existing Bun/Core contracts and package boundaries remain intact.

## Tests Added

- `tests/bun/milestone-18/http-conveniences.test.ts` — signing and pagination edge cases.
- `tests/bun/milestone-18/http-integration.test.ts` — generated route, middleware, pagination, JSON/page file responses.
- `tests/bun/milestone-18/signed-compiler.test.ts` and fixture — compiler alias emission.
- `tests/validation/file-rules.test.ts` — each file rule and metadata limits.

## Tests Run

- Milestone 18 tests: 10 passed, 0 failed.
- File rule tests: 3 passed, 0 failed.
- Affected auth/OAuth/Milestone 17 plus new suites: 24 passed across 7 files.
- `pnpm typecheck` passed after updating three test context fixtures for the required pagination property.
- `pnpm --filter @bunwire/validation build`, `pnpm --filter @bunwire/bun build`, `pnpm test:built-exports`, and `pnpm check:boundaries` passed.
- Broad `pnpm exec vitest run tests/bun tests/validation`: 342 passed, 2 failed in old Milestone 1 expected middleware lists. The two expectations were updated for `signed`; targeted rerun of both files passed 11/11 tests. Previously passing unrelated tests were not rerun.
- Final `pnpm --filter @bunwire/bun build`, `pnpm test:built-exports`, `pnpm typecheck`, and `pnpm check:boundaries` passed after the fixes.

## Test Results

- Initial targeted integration failures exposed missing manually authored middleware metadata and two expectation errors; these were corrected and rerun successfully. The first export audit found the expected allowlist delta; the committed allowlist was updated and audit passed. The broad regression's only failures were the two Milestone 1 expectations noted above, then both files passed.

## Regression Checks

- Bun and validation suites: 342/344 passed on the broad run; the two old descriptor expectations were updated and passed on targeted rerun. No functional regression failures remained.
- Generated example files changed by the Vite test run were restored to their original state.

## Expected Behavior

- A configured Bun HTTP application can sign relative links, verify them with `@Use("signed")`, and inject the signer through `BUN_SIGNED_URLS`.
- Managed HTTP requests expose bounded pagination and Form Requests validate native uploaded `File` values using the shared validation engine.

## Not Expected Yet

- One-time signed links, key-ring rotation, cursor pagination, database integration, or file content inspection.

## Important Decisions

- Use a signed URL secret independent from sessions; relative links by default and an explicitly configured trusted origin for absolute output. Replacing the secret invalidates prior links; no multi-key rotation in this milestone.
- Reject malformed pagination input with HTTP 400. File rules inspect Web `File` metadata and remain framework-independent.

## Known Limitations

- None yet beyond intentionally deferred behavior above.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 19 is next in `MILESTONES-v2.md`.
