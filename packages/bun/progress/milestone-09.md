# Milestone 9 — Server-Driven Pages and `@bunwire/vite` Bridge

Status: Complete

## Packages Changed

- `packages/bun`
- `packages/vite`
- `examples/bun-app`
- Core compiler extension contracts, tests, public-export audit, and architecture documentation

## Implemented

- Added the versioned page result and payload protocol, navigation/version headers, injection-safe initial HTML shell, JSON navigation responses, deterministic shared props, selected flash props, and exact generated-asset serving.
- Added page-aware validation redirects backed by framework-owned session state and explicit Form Request old-input selection.
- Added the framework-neutral `@bunwire/bun/client` navigation client and the React-first `@bunwire/bun/react` renderer, `Link`, and `usePage` entrypoint.
- Added declarative Vite page configuration, canonical contained page discovery, lazy `virtual:bunwire/pages` resolution, development HMR invalidation, and deterministic production manifests with hashed assets.
- Added the React page example with authentication/CSRF shared state and preserved bootstrap/entrypoint separation.
- Updated documentation, package exports, boundary rules, generated declarations, and public export audits.

## Remaining

- None.

## Acceptance Criteria

- [x] Controllers can return a first-class versioned page result.
- [x] Initial requests receive an injection-safe HTML shell and navigation requests receive page JSON.
- [x] Shared, flash, validation, authentication, and CSRF props compose deterministically.
- [x] Page-aware non-GET redirects use `303 See Other` and validation state survives exactly one session request.
- [x] The framework-neutral client supports navigation, history, external locations, and version reloads.
- [x] The React renderer exposes application, link, and current-page primitives through a browser-only subpath.
- [x] Vite discovers configured pages, emits lazy development modules, invalidates them for HMR, and writes exact production assets.
- [x] Page roots and entries remain inside the canonical project root, including after filesystem-link resolution.
- [x] Public exports, documentation, example, and impact-based verification are current.

## Tests Added

- Server page protocol, escaping, merge precedence, validation flash, redirect normalization, version mismatch, malformed options, and missing-component tests.
- Framework-neutral client initial render, navigation, popstate history, version reload, and external-location tests.
- Vite nested page discovery, lazy virtual module, deterministic development manifest, HMR invalidation, and production-manifest tests.
- Real Bun-process coverage for initial HTML, page JSON, production assets, version reloads, validation redirects, and selected old input.

## Tests Run and Results

- `node_modules\\.bin\\vitest.cmd run tests/bun/milestone-09/pages.test.ts tests/bun/milestone-09/client.test.ts tests/bun/milestone-09/vite-pages.test.ts --config vitest.config.ts`
  - Final affected behavior: 3 files, 12 tests passed.
  - The last combined run initially exposed one asynchronous test synchronization error; the corrected client test then passed 3/3.
- `node_modules\\.bin\\vitest.cmd run tests/bun/milestone-09/pages-process.test.ts --config vitest.config.ts`
  - Passed: 1 file, 1 test on Bun 1.3.14.
- Full Bun package regression run during the milestone:
  - 28 files, 113 tests; 112 passed and one process fixture failed because a preceding HMR test had replaced the source-side generated manifest.
  - The process fixture now consumes the authoritative production build manifest; its corrected focused process test passes.
- Full Vite package regression run during the milestone:
  - 17 files, 183 tests; 182 passed and one historical exact-artifact-shape test exposed an unconditional page path.
  - Page artifacts are now optional for non-page applications; the corrected historical test passes.
- `pnpm.cmd typecheck`
  - Passed.
- `pnpm.cmd check:boundaries`
  - Passed.
- `pnpm.cmd --filter @bunwire/example-bun-app build`
  - Passed; Vite emitted the entry, two lazy page chunks, and `bunwire-pages.json`.
- Built public-export audit, including `@bunwire/bun/client` and `@bunwire/bun/react`
  - Passed.
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`
  - Passed; only existing Git line-ending notices were emitted.

## Regression Checks

- Existing applications without page configuration retain the original generated artifact shape.
- Bun roles other than HTTP do not start page or HTTP resources.
- Bun and Vite remain within their documented dependency and source-discovery boundaries.
- The production example builds and its native Bun server serves only assets named by the generated manifest.
- The page process exits cleanly after Core-owned shutdown.

## Expected Behavior

After this milestone, Bun HTTP Controllers can select generated React page components through a framework-neutral, versioned server-driven page protocol. Vite supplies lazy development modules and exact production assets, while navigation, shared state, validation flash, and version reloads remain coordinated by Bunwire.

## Not Expected Yet

- Server-side React rendering, deferred or partial props, React Server Components, or non-React renderer packages.
- Bun-managed events/listeners, queued listeners, or later jobs/worker integrations.

## Important Decisions

- React is the first renderer through the browser-only `@bunwire/bun/react` entrypoint.
- Navigation remains framework-neutral through `@bunwire/bun/client`.
- Page components come only from a configured root and Vite-generated manifests; Bun performs no runtime source discovery.
- Page validation failures use session-backed redirect-and-flash behavior.
- Production asset roots are application-root-relative and the host starts from that application directory.

## Known Limitations

- Client rendering is browser-only; SSR and deferred data are intentionally outside this milestone.

## Blockers

- None.

## Next

- Milestone 10 — Events and Managed Listeners.
