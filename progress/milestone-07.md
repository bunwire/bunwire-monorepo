# Milestone 7 — `bunwire.config.*` and Vite Source Discovery

Status: Complete

## Packages Changed

- `packages/vite`
- `packages/core` (public export of the existing compiler-descriptor assertion only)
- `tests/milestone-07`
- `tests/fixtures/milestone-7-discovery`
- root TypeScript/Vitest aliases, lockfile, architecture documentation, and progress records

## Implemented

- Added the public `defineBunwireConfig()` and declarative `loadBunwireConfig()` APIs.
- Added deterministic config-file selection for `bunwire.config.{ts,mts,cts,js,mjs,cjs}` and typed `BunwireCompilerError` diagnostics.
- Resolved source roots and bootstrap paths relative to the real project root, rejecting absolute, missing, malformed, ambiguous, lexically escaping, and filesystem-link escaping paths.
- Added deterministic recursive JavaScript/TypeScript source discovery across configured roots, excluding declaration files and bounded outside files.
- Added cycle-safe deterministic source traversal that visits canonical directories once and reports broken/inaccessible links through typed diagnostics.
- Added limited bootstrap composition analysis for one direct `defineApp().withAdapter(new ImportedAdapter(...))` on the default-exported Application receiver chain, with named, aliased, default, or namespace imports.
- Resolved the selected adapter's executable module and own static compiler data property without importing the bootstrap, constructing the adapter, evaluating constructor arguments, invoking callbacks, or starting the Application.
- Made ESM package export conditions authoritative so a conflicting CommonJS `require` entry cannot supply different compiler metadata.
- Aggregated Core and adapter compiler class kinds, class decorators, method kinds, method decorators, parameter injectors, and metadata handlers through existing canonical registries.
- Preserved Milestone 5/6 identity protections: shadow canonical descriptors, duplicate identities, unknown owners, method-disabled owners, and noncanonical decorator references fail closed.
- Reserved and exported the `virtual:bunwire/*` generated-module namespace without generating Milestone 8 registries.
- Documented the public compiler boundary and mapped every Milestone 7 test checkbox to automated evidence.

## Remaining

- None within Milestone 7.

## Acceptance Criteria

- [x] Relative source root resolves correctly.
- [x] Relative bootstrap path resolves correctly.
- [x] Multiple source files are discovered deterministically.
- [x] Files outside the configured source graph are ignored unless explicitly allowed by compiler rules.
- [x] Adapter compiler extensions resolve from the adapter class used in bootstrap.
- [x] Runtime adapter configuration is not duplicated in `bunwire.config.*`.
- [x] Discovery does not instantiate adapters or execute native callbacks/arbitrary runtime configuration.
- [x] Invalid source roots produce actionable diagnostics.
- [x] Unresolvable adapter compiler integration produces actionable diagnostics.
- [x] Runtime code has no source-tree scanning dependency.
- [x] Malformed config/bootstrap paths and source-root escapes fail closed.
- [x] Discovery and extension aggregation remain deterministic and conflict-safe.
- [x] Dual-export adapter packages select the ESM entry used by the bootstrap.
- [x] Unrelated or dormant adapter calls cannot replace the default-exported Application adapter.
- [x] Contained filesystem-link cycles terminate and invalid links fail with typed diagnostics.

## Tests Added

- `tests/milestone-07/compiler-discovery.test.ts` — 22 compiler-fixture, architecture, and adversarial tests.
- `tests/fixtures/milestone-7-discovery` — bounded graph, ignored outside file, declarative config variants, exported/decoy/invalid bootstraps, and a counter-instrumented compiled fake adapter.

## Tests Run

- `node_modules\.bin\tsc.cmd -b packages/core packages/vite --pretty false`
- `node_modules\.bin\tsc.cmd -p tsconfig.tests.json --noEmit --pretty false`
- `node_modules\.bin\vitest.cmd run tests/milestone-07/compiler-discovery.test.ts`
- `pnpm.cmd quality`
- `pnpm.cmd test:clean-install`
- `git -c safe.directory=D:/Projects/GitHub/bunwire/bunwire-monorepo diff --check`

## Test Results

- Focused Milestone 7: 22 passed, 0 failed, 0 skipped.
- Full repository suite: 134 passed, 0 failed, 0 skipped across 10 files.
- Typechecking: production and test projects passed.
- Package boundaries: passed.
- Workspace builds: Core, Vite, Electrobun, and example application passed.
- Clean verification: frozen-lockfile install and workspace typecheck passed in a fresh temporary workspace.
- Diff whitespace check: passed.

## Corrective Verification — 2026-08-22

- Reproduced and corrected CommonJS-first resolution selecting a package's `require` descriptor instead of the ESM bootstrap's `import` descriptor.
- Reproduced and corrected whole-file bootstrap scanning that allowed unused or dormant adapter calls to affect composition-root discovery.
- Reproduced and corrected unbounded traversal through a contained directory-link cycle and raw failure for a broken link.
- Passed: focused Milestone 7/Vite suite, 1 file and 22 tests.
- Passed: full quality gate, 10 files and 134 tests, production/test typechecking, package boundaries, and all four workspace builds.
- Failed: none.

## Regression Checks

- All Milestones 0–6 tests passed unchanged in the final quality run.
- Core still builds independently and boundary enforcement still prohibits Core-to-Vite/Electrobun imports.
- The Vite package builds independently through its package script.
- Runtime Core, Electrobun, and example source remain free from filesystem scanning imports/calls.
- Existing canonical class-kind, method-kind, registry-decoration, startup, Provider registration, and invocation-order tests remain green.

## Expected Behavior

After this milestone:

- build tooling has one deterministic, project-contained Bunwire source graph and bootstrap path;
- the bootstrap remains the only location for runtime adapter options;
- discovery can identify the statically imported primary adapter and aggregate its declarative compiler extensions;
- dual-export packages use the ESM-compatible adapter entry and unrelated bootstrap expressions are ignored;
- contained source-directory aliases and cycles terminate deterministically;
- invalid configuration or integration fails with a stable typed diagnostic;
- discovery performs no adapter instance lifecycle or callback execution; and
- no runtime package scans application source trees.

## Not Expected Yet

- TypeScript Program/symbol analysis of managed classes or methods.
- Constructor DI inference, parameter classification, compiled invocation plans, or generated runtime registries.
- Electrobun runtime integration or frontend contracts.
- Any Milestone 8 functionality.

## Important Decisions

- Config loading parses a narrow literal object instead of executing the build-config module, keeping source bounds deterministic and preventing arbitrary config code execution.
- Bootstrap analysis is intentionally limited to the direct, statically imported adapter-class composition shape documented for v1. Factories and otherwise indeterminate expressions receive actionable diagnostics.
- Bootstrap analysis follows only the default-exported Application receiver chain and never searches callback bodies, constructor arguments, dormant branches, or unrelated expressions for adapters.
- Only the selected adapter's compiled JavaScript module is imported to read its own static compiler data property. Normal module initialization can occur, so adapter compiler descriptors must be declarative and side-effect-free; adapter construction and runtime configuration never occur.
- Compiler extension aggregation reuses Core's public canonical registries rather than maintaining a weaker Vite-only identity map.
- Package adapter resolution honors ESM `import` exports (with `module`/`main` fallbacks) instead of relying only on CommonJS resolution.
- Conditional package exports are evaluated in declaration order using active `node`, `import`, and `default` conditions; `require` is not an active compiler-bootstrap condition.
- Canonical source directories are visited once per configured root, making contained aliases idempotent and cycles finite.
- The Core change only exports its already-existing `assertAdapterCompilerDescriptor()` boundary; Vite does not import Core internals.

## Architectural Issues Encountered

- CommonJS-first package resolution could select different compiler metadata from the ESM bootstrap entry. Corrected by making ESM export conditions authoritative.
- Whole-file `withAdapter()` scanning was not bound to the exported composition root. Corrected with receiver-chain analysis of the single default export.
- Contained directory symlinks could revisit an ancestor indefinitely. Corrected with canonical-directory visitation tracking and typed link diagnostics.
- The first full quality run exposed the existing 10-second Vitest hook ceiling while Milestone 0 performed its isolated copy/build under concurrent load. The global hook ceiling was aligned with that test's existing 120-second subprocess ceiling; no test or assertion was weakened.
- The first clean-install attempt was denied registry access by the sandbox after accepting the lockfile. The identical frozen-lockfile check passed when rerun with network permission.

## Deviations or Unresolved Questions

- None.

## Known Limitations

- Relative adapter imports must resolve to executable JavaScript at compiler runtime; raw TypeScript adapter modules receive an actionable diagnostic. Package imports resolve through their compiled exports.
- Milestone 7 does not follow arbitrary bootstrap control flow or adapter factories. That would require executing runtime configuration or implementing broader symbol/control-flow analysis outside this milestone.

## Blockers

- None.

## Next Work Within This Milestone

- None. Milestone 7 is complete; Milestone 8 remains unstarted.

## Prior-Milestone Regression Closure — 2026-08-24

- Vite now watches config, bootstrap, source roots, and discovered files; edits, additions, removals, renames, and source-root changes invalidate cached analysis and both generated virtual modules.
- Source discovery tolerates files disappearing between directory enumeration and canonicalization during real rename/delete watcher events.
- Full details and verification are recorded in [the dedicated closure record](prior-milestone-regression-closure.md).
