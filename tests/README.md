# Milestones 0–2 automated acceptance matrix

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

## Commands

- `pnpm test` runs the complete centralized Vitest suite.
- `pnpm typecheck` checks production code, tests, and type-level assertions.
- `pnpm test:clean-install` creates a temporary clean workspace, performs a frozen-lockfile install, and runs production and test typechecks.
- `pnpm quality` runs boundary checks, typechecking, all Vitest tests, and all workspace builds.
