# Milestone 22 — Advanced Page Protocol Features

Status: Complete

## Packages Changed

- `@bunwire/bun`
- `@bunwire/vite`
- Release test fixtures and the focused Bun HTTP process fixture

## Implemented

- Negotiated protocol 2 partial/deferred page responses while preserving complete protocol 1 responses.
- Added deferred prop evaluation inside fresh HTTP requests, client cancellation and stale-navigation checks, and targeted partial prop merging.
- Added optional renderer callback, separate Vite SSR build manifest, React server rendering, and React hydration.

## Remaining

- None.

## Acceptance Criteria

- [x] Partial props, deferred props, and SSR can be enabled independently.
- [x] Version-1 clients and the `page()` helper remain usable.
- [x] Deferred work finishes within its request scope, and stale results cannot race later navigation.

## Tests Added

- `tests/bun/milestone-22/pages.test.ts`
- `tests/bun/milestone-22/client.test.ts`
- `tests/bun/milestone-22/pages-process.test.ts`
- `tests/bun/milestone-22/react-hydration.test.ts`
- `tests/bun/milestone-22/vite-ssr.test.ts`

## Tests Run

- Focused Milestone 22 and Milestone 9 page suite: 9 files, 27 tests passed.
- After a special JSON key regression fix, focused Milestone 22/Milestone 9 server page tests: 2 files, 13 passed; Bun package build passed again.
- Vite compiler discovery/config suite: 22 tests passed.
- Real Bun page process tests for Milestones 9 and 22, rerun after adding the scope-disposal check: 2 passed.
- `pnpm --filter @bunwire/bun build`: passed.
- `pnpm --filter @bunwire/vite build`: passed.
- `pnpm exec tsc -p tsconfig.tests.json --noEmit --pretty false`: passed.
- `pnpm check:boundaries`: passed.
- `pnpm test:built-exports`: passed after updating the intentional public export allowlist.
- `pnpm test:release-pack`: passed.

## Test Results

- Earlier first process run failed because the fixture loaded stale ignored `dist` output; rebuilding the changed Bun package resolved it.
- Earlier SSR build test exposed a relative output-path bug; it was fixed and the focused test passed.
- A new special JSON prop-name test first exposed a prototype assignment issue; null-prototype prop staging fixed it, and the focused test passed.
- Final focused regression pass passed. The full Bun package suite was not run because the changes were confined to page handling, Vite page/config generation, and the new public SSR entry.

## Regression Checks

- Existing page HTML, full JSON, validation flash/old input, development HMR, and production version/asset behavior passed.
- Real HTTP deferred follow-up leaves its Bun request scope disposed after the response.
- Client tests cover partial merging, deferred completion/failure, and stale navigation; server tests cover authorization checks and cancellation.

## Expected Behavior

- Version-1 clients receive complete page props; protocol-2 clients may request selected props and defer top-level props to authorized follow-up requests.
- Initial HTML optionally contains SSR markup and safely escaped state; the React adapter hydrates it or mounts client-only pages.
- Separate Vite browser and server builds yield manifests that can be combined at application bootstrap.

## Not Expected Yet

- Streaming deferred props or built-in SSR renderers for frameworks other than the optional React helper.

## Known Limitations

- Initial document requests remain version-1 full pages because they cannot negotiate the navigation capability; deferred delivery begins on protocol-2 navigations.
- Deferred resolver cancellation is cooperative while a resolver is running. Bunwire observes the request abort before and after resolution, and keeps the request scope open until the resolver settles.

## Important Decisions

- Deferred values use follow-up requests, each with its own request scope.
- SSR uses a framework-neutral renderer callback; React remains optional.

## Blockers

- None.
