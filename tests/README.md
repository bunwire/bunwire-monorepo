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

## Milestone 8

All tests below are in `tests/milestone-08/constructor-analysis.test.ts` with sources in `tests/fixtures/milestone-8-analysis`.

| Milestone test | Automated evidence |
|---|---|
| Aliased `@Service()` is recognized by symbol | Aliased decorator plus same-named unrelated decorator adversarial test |
| Imported managed class dependency auto-injects | Cross-file Controller-to-Service dependency test |
| Plain undecorated class does not auto-inject | Typed constructor diagnostic fixture |
| `@Inject(RandomUtility)` is an explicit container source | Indexed explicit-class reference assertion |
| `@Inject(CACHE)` supports an interface parameter | Indexed explicit-token reference assertion |
| Interface without `@Inject()` fails clearly | Source-located interface diagnostic fixture |
| Constructor parameter positions are preserved | Three-position mixed inferred/explicit plan assertion |
| Cross-file and aliased class symbols resolve | Canonical symbol/declaration-location assertion |
| Canonical decorators survive re-exports | Re-exported Service fixture |
| Same-ID counterfeit class and Inject decorators fail | Canonical compiler-symbol adversarial fixtures |
| Invalid compiler-symbol declarations fail closed | Missing, unresolvable, missing-export, and duplicate-symbol tests |
| Explicit injection accepts only runtime tokens | Primitive, object, function, `any`, and `unknown` rejection fixtures |
| Hidden inherited constructor parameters fail | Implicit and explicit forwarding-constructor fixtures |
| Detectable managed constructor cycles fail | Direct and two-class cycle fixtures |

## Milestone 9

All tests below are in `tests/milestone-09/method-analysis.test.ts` with sources in `tests/fixtures/milestone-8-analysis`.

Additional adversarial coverage proves same-ID method/injector symbols cannot impersonate registered exports and that static, abstract, or declaration-only managed methods fail before runtime plan generation.

| Milestone test | Automated evidence |
|---|---|
| No-injection indexes map directly | Two-parameter `direct` fixture |
| One middle injection compacts caller indexes | `strict` fixture |
| Multiple interleaved injections compact | Seven-parameter `interleaved` fixture |
| Explicit token is caller-invisible | Interface-token parameter assertion |
| Framework injector is caller-invisible | Resolver source/index assertion |
| Optional caller parameters remain optional | Optional `active` caller assertion |
| Managed injectable type auto-injects | `MethodUserService` source assertion |
| Plain DTO/class remains caller-visible | `PayloadDto` transport assertion |
| Interface plus `@Inject(TOKEN)` is container-resolved | `MethodCache`/`METHOD_CACHE` assertion |
| Parameter injector wins over type DI | Managed-type parameter with `@FrameworkValue()` fixture |
| Too few/too many caller args fail before invocation lifecycle side effects | Generated strict-plan Application and Electrobun short-circuit tests |
| Invalid method placement fails at compile time | `@Subscribe()` on `@Service()` fixture |
| Incompatible parameter-source decorators fail | Combined framework-injector/`@Inject()` fixture |
| Rest semantics are preserved | Unbounded compiled rest-plan runtime invocation test |

## Milestone 10

All tests below are in `tests/milestone-10/generated-registry.test.ts` with the platform-independent source in `tests/fixtures/milestone-10-registry`.

| Milestone test | Automated evidence |
|---|---|
| Generated TypeScript typechecks | Real TypeScript Program semantic typecheck over emitted registry source |
| Same source is byte-stable | Reversed analysis-record input emits the identical source and hash |
| Runtime performs no source scanning | Core runtime and generated-source architecture scan |
| Constructor plan constructs a Controller | Generated registry installs `RegistryController` dependency metadata in the Container |
| Interleaved method plan executes | Fake adapter invokes caller, managed-class, token, and resolver parameters end to end |
| Provider lifecycle integrates | Generated Provider registers once and boots once per invocation |
| Fake adapter metadata executes | Generic class/method descriptor, resolver, registry-consumer, and Application flow |
| Missing token uses Container diagnostics | Generated missing-token plan rejects with `ContainerResolutionError` |
| Virtual module loads correctly | Canonical resolve/load/cache/rebuild hook test plus unknown-module rejection |
| Generated identities fail closed | Duplicate generation and malformed runtime registry adversarial tests |

## Milestone 12

Caller-contract and full-application coverage lives in `tests/milestone-12`, backed by `tests/fixtures/milestone-12-electrobun` and the real native Electrobun smoke fixture.

| Milestone test | Automated evidence |
|---|---|
| Correct caller arguments compile | Generated module semantic typecheck with required and optional calls |
| Managed Service, token value, and native Window cannot be supplied | `@ts-expect-error` caller-boundary assertions derived from the compact plan |
| Missing and excessive arguments fail typechecking | Fixed generated request tuple assertions |
| Optional/defaulted/rest/array arguments are preserved | Type-level and runtime `get`, `defaulted`, and `deleteUsers` calls |
| Request result is inferred and message result is `void` | `Promise<UserResult>` and message no-response assertions |
| Generated schema fits Electrobun 1.18.1 | Bundler-resolution semantic check using `Electroview.defineRPC<BunwireClientSchema>()` |
| Private native encoding stays private | Generated-source/public-export scan plus positional native smoke calls |
| Importing bootstrap does not start | Application state, callback, and native-instance assertions before `start()` |
| Normal native context and callbacks work | Full adapter construction and exact callback-object identity assertions |
| Generated DI reconstructs the method | Constructor Service, method Service, token, Window, Webview, and Context result assertions |
| Runtime caller bounds remain authoritative | Untyped too-few/too-many transport attempts through the generated client bridge |
| Provider lifecycle works | Register-once and unique boot-per-invocation assertions |
| Middleware is compiler-generated | Runtime before/after events, canonical alias, counterfeit-ID, and non-callable tests |
| Manual integration works | Existing `BrowserWindow` context through `withContext(existingContext).start()` |
| No manual construction or handler table | Application-source architecture scan |
| Actual native host accepts positional calls | Real pinned Electrobun process smoke request/message markers |

## Middleware Redesign Milestone 12A

All tests below are in `tests/milestone-12a/core-managed-middleware.test.ts`.

| Milestone test | Automated evidence |
|---|---|
| Canonical middleware kind/decorator identity | Kind capabilities, compiler symbol, and own metadata assertions |
| Malformed/counterfeit targets fail closed | Missing-handle, wrong-kind, and same-kind counterfeit decorator tests |
| Definitions and attachments are canonical and immutable | Frozen metadata, filter, dependency, and ordered parameter assertions |
| Middleware defaults to transient registry scope | Scope-default registry assertion |
| Constructor DI resolves from the invocation child | Indexed singleton dependency integration test |
| Concurrent invocations receive distinct instances | Barrier-synchronized transient isolation test |
| Singleton dependencies retain root identity | Cross-invocation/root identity assertions |
| Chain order and result transformation work | Nested before/after event and transformed-result test |
| Short-circuit and errors behave correctly | Terminal suppression plus middleware/terminal rejection tests |
| `next()` runs at most once | Dedicated `MiddlewareNextError` test |
| Provider boot, middleware, and Controller share one scope | Around-invocation Controller integration with invocation-local bindings |
| Core remains platform-independent | Middleware source/import boundary scan |

## Middleware Redesign Milestone 12B

Compiler coverage lives in `tests/milestone-12b`, backed by `tests/fixtures/milestone-12b-middleware`.

| Milestone test | Automated evidence |
|---|---|
| Canonical aliases/re-exports are recognized | Exact compiler-symbol and analyzed-kind assertions |
| Same-ID counterfeit decorators fail | Adversarial decorator-symbol fixture |
| Literal intrinsic metadata is compiled | Complete/partial alias and filter analysis assertions |
| Dynamic or malformed metadata fails | Identifier, call, spread, computed, visibility, getter, constructor, template, missing, empty, type, and duplicate fixtures |
| `only` and `except` are exclusive | Conflicting transport-filter fixture |
| Aliases are globally unique and deterministic | Reversed source-input duplicate-alias assertions |
| Middleware class shape is enforced | Anonymous, unexported, abstract, missing/static/declaration-only handle fixtures |
| Inherited concrete `handle()` is valid | Re-exported decorator and concrete-base fixture |
| Constructor DI matches managed classes | Managed Service, explicit token, plain/interface, inherited-constructor, and cycle fixtures |
| Analysis executes no middleware code | Throwing static block/constructor/handle analysis-generation fixture |
| Definitions are deterministic and type-correct | Reversed analysis, stable hash/source, and semantic TypeScript checks |
| Generated definitions satisfy Core 12A | Runtime registry loading, immutable metadata, and transient-resolution assertions |

## Middleware Redesign Milestone 12C

Core and compiler coverage lives in `tests/milestone-12c`, backed by `tests/fixtures/milestone-12c-attachments`.

| Milestone test | Automated evidence |
|---|---|
| Canonical class and alias references resolve | Aliased/re-exported decorators, canonical symbols, and alias-map assertions |
| Parameters parse without coercion | Trimmed multi-parameter and second-colon preservation assertions |
| Controller and method order is deterministic | Top-to-bottom, left-to-right, Controller-first generated-plan assertions |
| Exact duplicates remain in the 12C analysis input | Repeated canonical attachment fixture (12D normalization now removes them from final plans) |
| Invalid references fail closed | Unknown/empty aliases, empty parameters, escaping, identifiers, templates, calls, plain and counterfeit targets |
| Placement is restricted | Service, unmanaged class, undecorated/property/static/abstract method fixtures |
| Generated plans contain no local aliases | `defineMiddlewareAttachment()` source and runtime target assertions |

## Middleware Redesign Milestone 12D

Core and compiler coverage lives in `tests/milestone-12d`, backed by `tests/fixtures/milestone-12d-policy`.

| Requirement | Test evidence |
| --- | --- |
| Runtime policy callbacks never execute | Core startup, repeated/late-call, and prebuilt-registry tests |
| Strict compiler-only policy DSL | Direct callback and exhaustive forbidden statement/expression cases |
| Forward/nested groups and cycle paths | Valid expansion plus direct/indirect cycle diagnostics |
| Controller path mappings | POSIX-normalized multi-root, overlapping, invalid, and unmatched pattern tests |
| Four-scope canonical order | Global → mapped → Controller → method pipeline assertion |
| Exact attachment deduplication | Same target/parameters removed while distinct parameterizations remain ordered |
| No unresolved runtime policy | Generated source, semantic typecheck, immutable runtime registry assertions |
| Analysis executes no application code | Throwing bootstrap, module initializer, middleware initializer, and method fixture |
| Attachments are immutable and runtime-validated | Core plan validation and frozen parameter tests |
| Attachment-only pipelines remain canonical | Runtime and generated plans contain validated managed attachments only |
| Analysis executes no application code | Throwing static block and method analysis-generation fixture |
| Output is stable and type-correct | Reversed analysis, stable hash/source, semantic TypeScript, and runtime registry checks |

## Middleware Redesign Milestone 12E

Adapter and generated-host coverage lives in `tests/milestone-12e`, with the real process fixture in `tests/fixtures/milestone-11-native-smoke`.

| Requirement | Test evidence |
| --- | --- |
| Typed immutable context | Exact native identity plus frozen context, logical args, and attachment parameters |
| Electrobun filters | Normalized separators, segment `*`, full-segment `**`, include/exclude precedence, and request/message filters |
| Startup validation | Invalid patterns/transports and missing middleware definitions fail before Providers |
| One invocation scope | Provider boot, transient constructor DI, resolver context, and Controller observe one child scope |
| Request semantics | Before/after nesting, transformations, short circuits, middleware failures, and Controller failures |
| Message semantics | Result suppression, Controller failure callback, missing-callback logging, and callback-failure logging |
| Normal/manual parity | One compiler-generated normalized registry executes in both host modes |
| Native coexistence | Manual fallback, wildcard listeners, outgoing requests/messages, readiness, and object identity remain intact |
| SDK and native process | Public context typecheck plus generated-registry native smoke with DI, filters, parameters, request/message dispatch, and short circuit |

## Middleware Redesign Milestone 12F

Finalization coverage lives in `tests/milestone-12f`, backed by the compiler-generated `tests/fixtures/milestone-12f-fake-queue` adapter.

| Requirement | Test evidence |
| --- | --- |
| Callback API removal | Runtime rejection, attachment-only plan validation, type/public-export scans |
| Canonical generated source | Every method entry uses `defineMiddlewareAttachment()` and semantic TypeScript checking passes |
| Second-adapter independence | Fake queue adapter contributes its own Consumer class kind, command/event method kinds, exact-topic matching, and immutable context |
| Adapter-owned selection | Nonmatching classes are never constructed; include/exclude and only/except remain outside Core/Vite |
| Managed execution semantics | Ordering, transformations, short circuits, failures, parameters, and event-result suppression |
| One invocation scope | Provider boot, transient constructor DI, resolver values, and Controller parameters share invocation identity |
| Boundary proof | Core and generic Vite source contain no fake queue topics, transports, context, or matching branches |

## Prior-Milestone Regression Closure

Closure coverage is integrated into Milestones 2, 5, 10, and 12. `tests/milestone-12/virtual-modules-vite.test.ts` uses a real Vite middleware-mode server and a temporary copied application to verify exact ambient declarations, byte-stable artifact writes, virtual transforms, edit/add/delete/rename refreshes, source-root config changes, module-graph invalidation, and unrelated-file/generated-output exclusion. `tests/fixtures/prior-regression-imports` verifies public named, default, and namespace package export identities.

## Commands

- `pnpm test` runs the complete centralized Vitest suite.
- `pnpm typecheck` checks production code, tests, and type-level assertions.
- `pnpm test:clean-install` creates a temporary clean workspace, performs a frozen-lockfile install, and runs production and test typechecks.
- `pnpm quality` runs boundary checks, typechecking, all Vitest tests, and all workspace builds.
