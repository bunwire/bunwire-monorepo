# Milestone 12 — Generated RPC Contracts and End-to-End Application

Status: Complete

## Packages Changed

- `packages/core` — canonical `@Use()` managed-method middleware attachment metadata.
- `packages/vite` — caller-contract generation, middleware reference analysis, and `virtual:bunwire/client`.
- `packages/electrobun` — adapter-contributed caller metadata, positional client bridge, and generated-schema integration.
- `examples/electrobun-app` — full generated normal-host example.
- `tests` — type-level, compiler, runtime/E2E, real-SDK, manual-host, architecture, and native-process coverage.
- `docs`, package READMEs, test documentation, and project progress records.

## Implemented

- Audited the completed Milestone 11 adapter, compiler analysis, generated runtime registry, virtual modules, invocation plans, examples, tests, package boundaries, and progress state before implementation.
- Added an Electrobun caller-contract metadata handler that maps canonical method kinds to request/message behavior, resolves endpoints with adapter-owned normalization, and names the adapter client/schema exports without adding Electrobun branches to Vite.
- Added deterministic `generateCallerContractModule()` output and `virtual:bunwire/client`, sharing the Vite plugin's cached application analysis with `virtual:bunwire/registry`.
- Generated request/message maps from parameters already classified as `transport`, ordered by authoritative `argumentIndex`, while selecting types from the original method at each authoritative `methodIndex`.
- Preserved fixed required parameters, defaulted parameters before later required positions, trailing optional parameters, final rest parameters, and array-valued logical parameters.
- Generated Promise request results from original managed-method return types and `void` message calls.
- Added `BunwireClientSchema` integration with the real Electrobun frontend API and verified `Electroview.defineRPC<BunwireClientSchema>()` against the pinned 1.18.1 SDK.
- Added `createElectrobunClient()` as the adapter-owned positional bridge. Its request/message methods copy logical arguments into the private native payload; neither the private payload type nor its shape is exported or generated into caller modules.
- Added canonical Core `@Use(exportedMiddleware)` support, exact compiler-symbol authorization, callable/exported reference validation, deterministic generated-plan attachment, runtime metadata, and counterfeit-ID rejection.
- Replaced the placeholder example with a complete generated application containing bootstrap/host separation, declarative Electrobun configuration and native callbacks, generated registry/client artifacts, Provider binding, Service and Controller constructor DI, managed-method auto-DI, explicit token injection, native parameter injection, middleware, request/message methods, and a typed frontend factory.
- Added a second manual bootstrap and E2E path that attaches the generated registry, supplies an existing native context, and calls `withContext(existingContext).start()`.
- Corrected the Milestone 12 host example to attach `virtual:bunwire/registry` explicitly because platform-independent Core does not import build-tool virtual modules.
- Updated the real native smoke frontend to use logical positional client calls and a logical generated-style schema rather than manually constructing the native payload.

## Remaining

- None within Milestone 12.

## Acceptance Criteria

- [x] Correct caller arguments compile.
- [x] Managed-method auto-DI Services, explicit token values, and Electrobun native objects cannot be supplied by frontend callers.
- [x] Missing required and excessive fixed arguments fail typechecking.
- [x] Optional, defaulted-before-required, rest, and array-valued arguments preserve their exact caller ordering and semantics.
- [x] Request return types are inferred and messages expose no meaningful response.
- [x] Generated contracts derive from the same classification/index metadata used to emit runtime plans.
- [x] Electrobun's single-payload representation remains a private adapter wire encoding.
- [x] Importing the bootstrap configures without starting; `start()` succeeds once and rejects repetition.
- [x] The full adapter creates native context declaratively and callbacks receive the exact native objects.
- [x] Adapter context/bindings exist before application Provider registration.
- [x] Correct caller arguments reconstruct constructor, method, token, Window, Webview, and Context values.
- [x] Too few and too many runtime arguments fail through the authoritative server plan.
- [x] Provider `register()` runs once and `boot()` runs for each caller-validated managed invocation; malformed caller counts fail before lifecycle side effects.
- [x] Adapter-owned bindings participate in the same Provider registration sequence.
- [x] Compiler-generated middleware surrounds managed invocation.
- [x] No application Service, Controller, or Provider is manually instantiated and no application-owned RPC handler table is required.
- [x] The manual-context fixture works through the actual manual adapter path.
- [x] Core remains platform-independent and Vite contains no Electrobun-specific semantics.

## Tests Added

- `tests/milestone-12/generated-client-e2e.test.ts` — seven generated-source, semantic type, pinned-SDK, virtual-module, normal-host, manual-host, runtime-boundary, lifecycle, DI, middleware, and architecture tests.
- `tests/milestone-12/middleware-compiler.test.ts` — canonical alias/runtime metadata, counterfeit symbol, and non-callable middleware tests.
- `tests/fixtures/milestone-12-electrobun` — complete compiler/runtime application plus expected-error frontend and real-SDK frontend contract sources.
- `tests/fixtures/milestone-8-analysis/invalid-shadow-use.ts` and `invalid-use-value.ts` — adversarial compiler fixtures.
- Extended `tests/electrobun-sdk-contract.mjs` with the new client/schema compatibility source.
- Updated the real Electrobun native smoke frontend to use positional requests/messages.

## Tests Run

- `node_modules\\.bin\\vitest.cmd run tests/milestone-12`
- `node_modules\\.bin\\vitest.cmd run tests/milestone-10 tests/milestone-11 tests/milestone-12`
- `pnpm.cmd --filter @bunwire/example-electrobun-app build`
- `node tests/electrobun-sdk-contract.mjs`
- `pnpm.cmd quality`
- `pnpm.cmd test:electrobun-native`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Passed: focused Milestone 12 suite, 2 files and 10 tests.
- Passed: full quality gate, 16 files and 195 tests, strict production/test typechecking, Core package-boundary checks, pinned real-SDK contract, and all four workspace builds.
- Passed: example generation and independent package build.
- Passed: actual Electrobun 1.18.1 Windows native host request/message smoke using positional client calls, exact result/message markers, and clean exit.
- Passed: isolated frozen-lockfile clean install and full workspace/test typechecking.
- Passed: repository whitespace validation.
- Expected environment-only failures: first sandboxed native/clean-install runs were denied network access; approved network/native reruns passed unchanged.

## Regression Checks

- Milestones 0–11 remain green in the complete suite.
- Canonical class/method/decorator/compiler-symbol authorization remains fail-closed; `core.use` receives the same exact-symbol protection.
- Runtime-token, inherited-constructor, constructor-cycle, managed-method shape, plan, caller-bound, and registry validation remain green.
- Core contains no Vite, Electrobun, BrowserWindow, or platform imports.
- Vite contains no Electrobun IDs, decorators, native payload types, or endpoint branches.
- Generated caller source contains no private Electrobun payload shape or injected dependency names.
- Example/E2E sources contain no manual decorated-class construction or RPC handler table.
- The pinned SDK contract, real native host, package builds, boundaries, and clean install all pass.

## Expected Behavior

After this milestone:

- Frontend code obtains `{ request, message }` from `createBunwireClient(rpc)` in `virtual:bunwire/client` and supplies logical positional arguments only.
- `BunwireClientSchema` types the real Electrobun frontend RPC object without exposing a caller-facing payload contract.
- Injected Services, tokens, and platform objects are absent from frontend signatures and reconstructed server-side from the generated invocation plan.
- Requests infer their resolved result type; messages return `void`.
- Full adapter-owned and manual existing-host paths both execute the same generated registry and lifecycle.
- Exported `@Use()` middleware is compiler-authorized and emitted into managed-method plans.

## Not Expected Yet

- Optional higher-level facades such as `client.users.get()`.
- Automatic Core imports of Vite virtual modules; the host entrypoint attaches the generated registry explicitly.
- Release hardening, performance work, and second-adapter release proof reserved for Milestone 13.

## Important Decisions

- Keep `virtual:bunwire/client` transport-shaped and positional; do not force a nested facade.
- Let adapter compiler metadata own endpoint naming, request/message mode, client factory, and schema mapping so Vite remains generic.
- Derive parameter types through the original exported class method and analyzed method indexes instead of reconstructing a second independent signature model.
- Keep the private native payload inside `@bunwire/electrobun`; generated source delegates to the adapter factory.
- Use the documented canonical `@Use()` decorator instead of manually rewriting generated plans in application code.
- Commit generated example artifacts and regenerate them through the public generators before each example build so project-reference typechecking works from a clean checkout.

## Known Limitations

- Electrobun 1.18.1 still publishes raw TypeScript that requires the dedicated Bundler-resolution compatibility gate documented in Milestone 11.
- The caller API is intentionally transport-shaped; a nested client facade remains optional future work.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 13 is next.

## Post-Review Corrections — 2026-08-24

- Centralized plan/invocability/caller-bound validation in `InvocationEngine.validateInvocation()` and made `Application.invokeManagedMethod()` reject malformed caller counts before child-scope creation, invocation configuration, Provider boot, adapter middleware, parameter resolution, or Controller execution.
- Preserved Promise-based failures and the pre-start Application-state error boundary.
- Updated the normal-host E2E lifecycle assertion so rejected malformed calls no longer count as booted invocations.
- Added Core and Electrobun short-circuit regressions; the focused correction suite passed 5 files and 55 tests, and final repository quality passed 32 files and 332 tests.
