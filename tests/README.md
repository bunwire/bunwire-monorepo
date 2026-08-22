# Bunwire automated acceptance matrix

This file maps every literal test checkbox in `docs/MILESTONES.md` to executable automation. No checkbox relies only on a statement in `progress.md`.

## Milestone 0

| Milestone test | Automated evidence |
|---|---|
| Core builds without Vite installed as a runtime dependency | `tests/milestone-00/foundation.test.ts` — isolated Core-only build test |
| Core builds without Electrobun installed as a runtime dependency | `tests/milestone-00/foundation.test.ts` — isolated Core-only build test |
| Deliberate `core -> vite` import fails | `tests/milestone-00/architecture.test.ts` |
| Deliberate `core -> electrobun` import fails | `tests/milestone-00/architecture.test.ts` |
| Workspace typecheck succeeds from a clean install | `tests/clean-install.mjs`, run by `pnpm test:clean-install` and `.github/workflows/quality.yml` |
| Workspace tests run from the root | `tests/milestone-00/foundation.test.ts` |
| Packages build independently | Four parameterized package-script tests in `tests/milestone-00/foundation.test.ts` |

## Milestone 1

| Milestone test | Automated evidence |
|---|---|
| Two class kinds coexist without enum changes | `tests/milestone-01/managed-classes.test.ts` |
| Class-kind IDs are stable and namespaced | `tests/milestone-01/managed-classes.test.ts`, including a type-level invalid-ID assertion |
| `injectable` is independent from `managedMethods` | `tests/milestone-01/managed-classes.test.ts` |
| Registry-managed but not method-managed kind | `tests/milestone-01/managed-classes.test.ts` |
| Adapter descriptor compiles using only Core APIs | `tests/milestone-01/public-api.test.ts` compiles `tests/fixtures/milestone-1-adapter` through `@bunwire/core` |
| Core contains no adapter-specific class-kind IDs | Production-source scan in `tests/milestone-01/public-api.test.ts` |

## Milestone 2

All tests below are in `tests/milestone-02/container.test.ts` and are separately named unless noted.

| Milestone test | Automated evidence |
|---|---|
| Equal-description custom tokens are unique | Runtime token test |
| Classes act as runtime tokens | Runtime token test |
| Interface-only types cannot become runtime tokens | `@ts-expect-error` assertion checked by `pnpm typecheck` |
| Zero-argument class resolves | Class-resolution test |
| Dependency index `0` resolves | Class-resolution test |
| Multiple dependencies preserve positions | Dedicated class-resolution test |
| Out-of-order metadata produces ordered arguments | Dedicated class-resolution test |
| Singleton identity within one container | Scope test |
| Separate containers do not share singletons | Scope test |
| Transient creates per resolution | Scope test |
| Token to value | Explicit-binding test |
| Token to factory | Explicit-binding test |
| Token to class | Explicit-binding test |
| Alias preserves singleton identity | Explicit-binding test |
| Missing token is actionable | Resolution-error test |
| Circular dependency includes a useful chain | Resolution-error test |

## Milestone 3

All tests below are in `tests/milestone-03/built-in-kinds.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| `@Service()` creates `core.service` metadata | Built-in Service metadata test |
| `@Controller()` creates `core.controller` metadata | Built-in Controller metadata test |
| `@Provider()` creates `core.provider` metadata | Built-in Provider metadata test |
| Service has `managedMethods=false` | Service class-kind capability test |
| Controller has `managedMethods=true` | Controller class-kind capability test |
| Provider identifies `register`/`boot` without ordinary routes | Provider lifecycle metadata test |
| Plain undecorated class has no managed capabilities | Plain-class boundary test |
| All built-ins use the generic extension mechanism | Decorator-definition identity test |
| Service scope metadata supports transient | Service scope test |
| Controller prefix is retained generically for adapters | Controller prefix metadata test |
| Provider follows the v1 zero-argument construction rule | Provider construction-policy test |
| Undecorated subclasses do not inherit managed identity | Built-in inheritance regression test |
| Managed subclasses can opt into independent metadata | Managed-subclass regression test |

## Milestone 4

All tests below are in `tests/milestone-04/application-kernel.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| `defineApp()` returns a stable Application before startup | Application definition test |
| Configuration chains without startup | Configuration-state test |
| `withContext()` stores context without startup | Manual-context test |
| `start()` creates one root container | Repeated and concurrent startup tests |
| Context is available before `register()` | Manual-context registration-order test |
| `register()` runs once across invocations | Registry deduplication/lifecycle-count test |
| `boot()` runs once per invocation | Lifecycle-count and invocation-context tests |
| Registration completes before invocations | Asynchronous registration-gate integration test |
| Explicit Provider binding overrides convention binding | Registration-precedence test |
| Concurrent invocation values do not leak | Synchronized concurrent-invocation test |
| `register()` receives the root container | Manual-context registration-order test |
| `boot()` receives real invocation context | Invocation-context identity/token test |
| Services receive no Provider lifecycle calls | Service lifecycle-separation test |
| Starting twice follows the clear-failure rule | Repeated and concurrent startup tests |
| Child containers inherit root bindings and isolate overrides | Child-container scope tests |
| Provider registry rejects non-Provider entries | Registry validation test |
| Provider constructors with optional/default/rest parameters receive zero arguments | Provider constructor-policy integration test |
| Required Provider constructor parameters fail at the typed registry boundary | Provider constructor type-level test |
| Undecorated Provider subclasses are rejected | Provider metadata-ownership registry test |
| Runtime Provider entries require callable `register(container)` | Provider lifecycle-shape diagnostic test |

## Milestone 5

All tests below are in `tests/milestone-05/managed-methods.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| Arbitrary prebuilt plan reconstructs method parameters | Scrambled-plan reconstruction test |
| Method and caller argument indexes are independent | Scrambled-plan reconstruction test with reversed caller coordinates |
| Container parameters interleave with caller arguments | Multi-container interleaving test |
| Resolver values interleave with caller and container values | Async multi-resolver interleaving test |
| Required and optional caller validation | Argument-boundary tests, including optional-before-required coordinates |
| Unknown resolver IDs fail clearly | Unknown-resolver diagnostic test |
| Fake method kind invokes without platform dependencies | Fake consumer/subscribe integration test |
| Owning class-kind restrictions are enforced | Disallowed and method-disabled owner tests |
| Plan indexes are complete and unique | Coordinate-system validation tests |
| Middleware surrounds invocation in attachment order | Middleware order/transformation test |
| Invocation results normalize sync/async behavior and failures | Result and error-propagation tests |
| Metadata-only method kinds cannot invoke | Non-invocable-kind test |
| Canonical class-kind registration is idempotent and rejects conflicting IDs | Class-kind registry test |
| A shadow `core.service` descriptor cannot bypass Service restrictions | Canonical owning-kind invocation test |
| Malformed runtime parameter records and middleware fail closed | Adversarial structural-validation test |
| Unregistered method kinds cannot invoke | Missing method-kind registration test |

## Milestone 6

All tests below are in `tests/milestone-06/adapter-extension.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| Adapter is a class instance matching the contract | Plain-object rejection and `Adapter` subclass attachment test |
| `withAdapter()` attaches the existing Application | Same-object and `onAttach()` identity assertions |
| Adapter contributes a Provider before startup | Fake adapter Provider registration/lifecycle tests |
| Prepared context is available during Provider registration | `APPLICATION_CONTEXT` identity and ordered-event assertions |
| Fake adapter adds a managed class kind without Core changes | Public `defineClassKind()`/decorator fixture plus Core source scan |
| Fake adapter adds a managed method kind without Vite changes | Public method-kind/decorator fixture plus Vite source scan |
| Fake adapter receives generated metadata | Runtime registry consumer capture test |
| Fake parameter injector is caller-invisible | Host invocation succeeds with one transport argument and rejects a second injected value |
| Invalid method decorator placement is rejected | `@Subscribe()` on a Core Controller produces an owning-kind diagnostic |
| Injector/class/method IDs are namespaced | Namespaced-ID unit test across all extension categories |
| Host waits for Providers and registries | Deferred Provider gate and host-acceptance integration test |
| Native callback receives the real host object | FakeHost reference/instance identity test |
| Manual adapter uses `withContext(existingContext).start()` | Existing-context host invocation integration test |
| One-primary-adapter and attachment state are enforced | Second-adapter and cross-Application reuse tests |
| Compiler metadata and validation hooks are contributed | Static metadata-handler and ordered validation-hook test |
| Canonical class/method identities cannot be shadowed | Shadow Core class-kind and adapter method-kind adversarial tests |
| Duplicate/missing/malformed contributions fail closed | Duplicate IDs, missing compiler/resolver, invalid owner, malformed registry, and missing manual context tests |
| Runtime plans require registered canonical method kinds | Missing and shadow method-kind registry tests |
| Runtime registries expose only decorated methods of the matching kind | Undecorated-method and decorator/plan-kind mismatch tests |

## Milestone 7

All tests below are in `tests/milestone-07/compiler-discovery.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| Config resolves a relative source root | Config resolution test |
| Config resolves a relative bootstrap path | Config resolution test |
| Multiple source files are discovered deterministically | Repeated bounded-discovery test |
| Files outside the configured source area are ignored | Bounded-discovery test with an adjacent outside file |
| Adapter compiler extensions are found from bootstrap | Aliased imported adapter/extension aggregation test |
| Adapter packages resolve through ESM import exports | Temporary package-style compiler fixture test |
| Dual-export packages select the ESM adapter entry | Divergent `import`/`require` descriptor fixture |
| Adapter discovery is anchored to the exported Application chain | Valid exported-chain and unused-adapter bootstrap fixtures |
| Runtime adapter configuration is not duplicated in config | Config/bootstrap composition-root source test |
| Discovery does not execute callbacks or arbitrary adapter runtime configuration | Adapter construction and native-callback counters remain zero |
| Invalid source root produces an actionable diagnostic | Typed missing-source diagnostic test |
| Unresolvable adapter compiler integration produces an actionable diagnostic | Factory-expression and missing-descriptor tests |
| Runtime has no source-tree scanning dependency | Production runtime-package source scan |
| Extension identities fail closed | Shadow Core kind and invalid owner tests |
| Duplicate extension contribution IDs fail closed | Repeated identical compiler metadata-handler test |
| Malformed and escaping configuration fails closed | Dynamic-config, missing-bootstrap, and root-escape tests |
| Virtual generated-module namespace is reserved | `virtual:bunwire/*` resolution test |
| Contained filesystem-link cycles terminate deterministically | Canonical-directory cycle test |
| Broken source-graph links fail with typed diagnostics | Broken-link source-discovery test |

## Commands

- `pnpm test` runs the complete centralized Vitest suite.
- `pnpm typecheck` checks production code, tests, and type-level assertions.
- `pnpm test:clean-install` creates a temporary clean workspace, performs a frozen-lockfile install, and runs production and test typechecks.
- `pnpm quality` runs boundary checks, typechecking, all Vitest tests, and all workspace builds.
