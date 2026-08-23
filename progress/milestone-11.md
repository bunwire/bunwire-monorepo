# Milestone 11 — Electrobun Adapter

Status: Complete

## Packages Changed

- `packages/electrobun`
- `packages/core`
- root workspace test/type-resolution configuration
- `tests/milestone-11`
- `tests/fixtures/milestone-11-electrobun`

## Implemented

- Reviewed the authoritative architecture, complete Milestone 11 requirements, and Milestones 6–10 progress records.
- Mapped Core's adapter preparation, application-context, Provider, generated-registry consumer, resolver, and invocation lifecycle boundaries.
- Inspected Electrobun's actual published native SDK and RPC implementation.
- Pinned `electrobun@1.18.1`, the latest npm release that exposes the importable `electrobun/bun` native SDK; Electrobun 2.x's npm package is a Hutch bootstrap and does not contain the runtime SDK without an application-specific `.hutch/devkit`.
- Added the class-based `ElectrobunAdapter` and explicit `ManualElectrobunAdapter`, both with their own static compiler descriptor association.
- Added `Route` and `Message` managed-method kinds/decorators allowed on Core Controllers through generic extension APIs.
- Added `Window`, `Webview`, and `Context` parameter injectors and runtime resolvers with stable namespaced identities.
- Added deterministic Controller-prefix/method-path normalization, inferred method-name paths, duplicate endpoint rejection, and invalid traversal-segment rejection.
- Added normal native RPC/BrowserWindow/BrowserView construction through Electrobun's actual `electrobun/bun` API, conventional `views://mainview/index.html` content, declarative geometry/native options, and hidden-until-ready host startup.
- Added typed callbacks that receive the exact adapter-created native window and fully attached RPC objects.
- Added adapter-owned native context/window/webview/RPC bindings through `ElectrobunBindingsProvider`.
- Added native request and message registry dispatch through Electrobun RPC's public `setRequestHandler()` and `addMessageListener()` APIs.
- Added caller-payload compaction into generated invocation plans, request result propagation, message fire-and-forget handling, message error reporting, and preservation of native outgoing `send`/`request` APIs.
- Added explicit readiness gates from RPC creation/manual preparation through Provider registration, registry consumption, and native host start.
- Made generic adapter Providers register before application Providers independently of fluent configuration order, preserving documented adapter-default/application-override precedence.
- Added manual native-context identity validation and protection against attaching the same native RPC lifecycle more than once.
- Documented normal and manual integration paths in `packages/electrobun/README.md`.
- Reopened Milestone 11 and replaced ambiguous scalar/array inference with the required tagged `{ args: [...] }` request/message envelope.
- Added explicit manual-host `fallbackRequestHandler` composition with Bunwire endpoint precedence and unchanged raw fallback payloads.
- Added a real Electrobun 1.18.1 compiler-API compatibility contract and corrected local RPC/webview declarations found by it.
- Added and passed a real Windows Electrobun process smoke application covering native host creation, RPC request results, array-valued arguments, message delivery, and clean shutdown.

## Remaining

- None.

## Acceptance Criteria

- [x] Normal `app.start()` creates/configures an Electrobun native host.
- [x] Manual `withContext()` integration works.
- [x] `Route` and `Message` compile and dispatch with distinct semantics.
- [x] Controller prefixes and explicit/inferred paths normalize deterministically.
- [x] Plain caller parameters, managed-class DI, explicit token injection, and adapter injectors compile into independent caller/method indexes without `@Arg`.
- [x] `Window`, `Webview`, and `Context` resolve through generated parameter plans.
- [x] Managed request and message traffic is gated until Providers and registries are ready.
- [x] Native callbacks and outgoing APIs preserve the exact Electrobun objects.
- [x] Undecorated Controller methods remain unexposed.
- [x] Adapter/application Provider ordering is deterministic regardless of fluent call order.
- [x] Compiler, runtime, architecture, boundary, build, and clean-install checks pass.
- [x] Manual native request fallback, tagged invocation envelopes, real-SDK compatibility, and a real native-process smoke run pass.

## Tests Added

- `tests/milestone-11/electrobun-adapter.test.ts` — eleven tests covering bootstrap adapter discovery, generated registry entries, caller/container/token/resolver parameter classification, no-`Arg` behavior, normalization, native construction/configuration callbacks, fully attached RPC callbacks, context/Provider ordering, early request/message traffic gates, request results, all adapter injectors, message no-response semantics, undecorated-method security, manual context, outgoing RPC preservation, malformed context/mode rejection, duplicate endpoints, exact SDK pin/use, and Core/Vite platform independence.
- `tests/fixtures/milestone-11-electrobun/src` — compiler fixture using the real public Core and Electrobun APIs.
- `tests/fixtures/milestone-11-electrobun/fake-native.ts` — API-faithful native-host fixture used because Electrobun FFI objects require an actual Electrobun host process and cannot be constructed inside Node/Vitest.
- `tests/electrobun-sdk-contract.mjs` and its fixture — checks Bunwire's compatibility surface against the real pinned SDK types while filtering unrelated upstream source diagnostics.
- `tests/electrobun-native-smoke.mjs` and `tests/fixtures/milestone-11-native-smoke` — builds and launches the real Electrobun host and verifies request/message markers before clean exit.

## Tests Run

- `node_modules\\.bin\\tsc.cmd -b packages\\electrobun --pretty false`
- `node_modules\\.bin\\tsc.cmd -p tsconfig.tests.json --noEmit --pretty false`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-11/electrobun-adapter.test.ts --reporter=dot --pool=forks --maxWorkers=1`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-04 tests/milestone-06 tests/milestone-11 --reporter=dot --pool=forks --maxWorkers=1`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-06 tests/milestone-07 tests/milestone-08 tests/milestone-09 tests/milestone-10 tests/milestone-11 --reporter=dot --pool=forks --maxWorkers=1`
- `pnpm.cmd quality`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`
- `node tests/electrobun-sdk-contract.mjs`
- `pnpm.cmd test:electrobun-native`

## Test Results

- Passed: focused Milestone 11 suite, 1 file and 14 tests.
- Passed: Application/adapter/Electrobun lifecycle regression suite, 3 files and 54 tests.
- Passed: Milestones 6–11 compiler/adapter regression suite, 6 files and 93 tests.
- Passed: final quality gate, real-SDK compatibility contract, 14 files and 185 tests, strict production/test typechecking, package-boundary validation, and all four workspace builds.
- Passed: real Electrobun 1.18.1 Windows native-process smoke with actual host creation, tagged request result `native|sdk`, message delivery marker, and clean exit.
- Passed: final isolated frozen-lockfile clean install and workspace typecheck, including the pinned Electrobun SDK.
- Passed: repository diff whitespace validation.
- Expected environment-only failure: the first sandboxed clean-install attempt could not access npm (`EACCES`); the approved network-enabled run and final rerun both passed unchanged.

## Regression Checks

- Milestones 0–10 remain green in the full suite.
- Core contains no Electrobun/BrowserWindow/BrowserView imports or platform branches.
- Vite contains no Electrobun-specific decorator, injector, path, or registry branches.
- Generic adapter Provider ordering remains compatible with Milestones 4 and 6 and now honors documented precedence independently of call order.
- `@bunwire/core`, `@bunwire/vite`, `@bunwire/electrobun`, and the existing example package all build.
- The lockfile contains `electrobun@1.18.1` and no Electrobun 2.x SDK assumption.

## Expected Behavior

After this milestone, the full adapter will own the normal Electrobun window/RPC bootstrap, while the manual adapter will consume an existing native context.

## Not Expected Yet

- Generated frontend RPC contracts.
- The complete example application and Milestone 12 end-to-end contract workflow.

## Important Decisions

- Use Electrobun's real `BrowserWindow`, `BrowserView`, and RPC APIs through the `electrobun/bun` export.
- Attach Bunwire request dispatch with Electrobun RPC's public `setRequestHandler()` and message dispatch with `addMessageListener()` so the native RPC object and its outgoing APIs remain intact.
- Require `{ args: [...] }` at the native transport boundary; generated Milestone 12 clients will hide this envelope from their positional API.
- Require manual hosts to re-supply their existing native request handler explicitly because Electrobun provides one setter and no supported getter.
- Keep all platform logic inside `@bunwire/electrobun`; Core and Vite remain generic.

## Known Limitations

- Node/Vitest runtime tests retain an API-faithful native substitute for deterministic assertions, while the separate mandatory native smoke command launches the actual pinned Electrobun host process.
- Electrobun 2.x requires an application-specific Hutch-generated devkit and therefore cannot currently serve as a normal reusable npm SDK dependency for this package.
- Electrobun 1.18.1 publishes raw TypeScript with extensionless internal imports and strict-option diagnostics, so directly importing its types from Bunwire's NodeNext project makes upstream SDK implementation files fail Bunwire's quality gate. Bunwire retains its narrow public compatibility declarations and validates them against the real SDK in a dedicated Bundler-resolution compiler Program that reports contract-fixture diagnostics while ignoring unrelated upstream source diagnostics.

## Architectural Issues Encountered

- Electrobun 2.x changed distribution: its npm package bootstraps Hutch and the actual SDK is generated into an application's `.hutch/devkit`. This reusable library therefore targets the latest directly importable native SDK release, `1.18.1`, rather than inventing declarations for an SDK absent from this workspace.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 11 corrections are complete; Milestone 12 remains intentionally unstarted.
