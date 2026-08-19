# AGENTS.md

## Project Instructions

This monorepo implements Bunwire and its Core, compiler/build tooling, adapters, examples, and supporting packages.

Before making changes, read and follow:

- `docs/README.md` — source of truth for Bunwire's architecture, concepts, terminology, runtime behavior, compiler behavior, adapter model, DI model, Provider lifecycle, managed decorators, and public API direction.
- `docs/MILESTONES.md` — source of truth for implementation order, milestone requirements, acceptance criteria, required tests, and intentionally deferred functionality.

Do not implement the project from assumptions or from generic framework conventions when the documentation defines different behavior.

If implementation details are unclear, prefer the architecture described in `docs/README.md` and the concrete acceptance requirements in `docs/MILESTONES.md`.

Do not silently redesign documented architecture while implementing it. If implementation reveals a genuine architectural conflict, record the conflict clearly in the current milestone's dedicated progress file before making the smallest reasonable implementation decision.

---

## Monorepo Structure

Bunwire is a monorepo.

Treat package boundaries as architectural boundaries, not merely folder organization.

Before implementing a feature, identify which package owns it based on `docs/README.md` and `docs/MILESTONES.md`.

Do not place shared framework behavior into an adapter package simply because that adapter is the first consumer.

Do not place platform-specific behavior into Core.

Maintain the intended dependency direction:

- Core must remain platform-independent.
- Compiler/Vite tooling may depend on Core contracts where appropriate, but must not depend on concrete platform adapters.
- Adapters may depend on Core.
- Application/example packages may depend on Core and adapters.
- Generated artifacts should be owned by the package or application layer defined by the architecture.

Avoid cross-package imports through internal source paths such as:

```ts
import { something } from "../../other-package/src/internal";
```

Prefer each package's public exports.

When another package needs a new API, expose it intentionally through the owning package's public entrypoint instead of bypassing package boundaries.

Keep package-specific tests close to the package they verify.

Cross-package integration and end-to-end tests should live in the appropriate integration/example test location defined by the repository.

When running builds or tests, prefer the monorepo's existing workspace commands and package scripts rather than inventing isolated commands that bypass workspace configuration.

When changing one package, check dependent workspace packages for regressions where relevant.

Do not create duplicate implementations of shared concepts across packages when the architecture gives that responsibility to a common package.

---

## Implementation Instructions

Implement Bunwire incrementally according to `docs/MILESTONES.md`.

Work through milestones in their documented order unless a later milestone contains infrastructure strictly required to complete the current milestone.

Do not skip acceptance criteria.

Do not implement intentionally deferred functionality unless it becomes necessary to satisfy a current milestone.

Prefer complete vertical behavior over placeholders. A milestone should leave the relevant feature working, tested, and integrated rather than merely defining interfaces that are never exercised.

Keep Core platform-independent. Core must not import or depend on Electrobun, Express, Node-specific host behavior, or any future adapter implementation unless the documentation explicitly places that concern in Core.

Respect the documented separation between:

- Core
- compiler/Vite tooling
- generated registries
- adapters
- application bootstrap
- runtime container
- Providers
- Services
- Controllers
- managed class decorators
- managed method decorators
- parameter injectors
- transport/caller-supplied arguments

Use the terminology defined by the architecture.

Container registrations are **bindings**, not Providers.

Providers are lifecycle/bootstrap classes.

Services are ordinary application/backend classes. Their methods are not automatically dynamically invoked.

Controllers and adapter-defined managed classes may contain methods dynamically invoked through generated runtime metadata.

Parameter injectors such as `@Inject()`, `@Window()`, `@Webview()`, and `@Context()` supply framework/runtime values and must not appear in caller-facing RPC arguments.

Do not introduce a requirement for manual positional argument decorators such as `@Arg(index)` for normal managed methods.

Parameter positions and caller-visible argument positions are compiler-generated.

Automatic type-based DI must respect the managed/injectable class model described in `docs/README.md`.

Do not automatically inject arbitrary plain TypeScript classes unless the architecture is explicitly changed to allow it.

Do not execute arbitrary Provider lifecycle code during Vite compilation.

Do not attempt to statically interpret arbitrary JavaScript or TypeScript control flow inside Provider methods.

The compiler determines **how** managed parameters are resolved.

Runtime Providers and container bindings determine **what** values are actually available.

---

## Application and Adapter Model

`defineApp()` creates an instantiated Application that may be configured before it is started.

The Application already exists when configuration methods such as `withAdapter()` are called.

Adapters are class instances.

`withAdapter()` attaches an adapter instance to the Application and gives the adapter access to that Application during configuration.

Adapters are active host integrations, not merely passive metadata objects.

A full adapter should own the normal bootstrap of its host platform wherever practical.

For example, the Electrobun adapter may own:

- Electrobun runtime setup
- RPC setup
- main-window creation
- adapter context creation
- adapter Providers
- parameter injectors
- managed method integrations
- native-object configuration callbacks
- binding of host/platform state required by Bunwire
- connection of generated Bunwire registries to Electrobun runtime behavior

Developers should normally configure these through the adapter instead of manually reproducing the platform bootstrap.

Adapters should expose native platform objects through appropriate callbacks or documented escape hatches so Bunwire does not unnecessarily hide or replace native APIs.

For example, an adapter configuration may expose callbacks that provide the actual native window, server, RPC object, or similar host object to the developer for additional configuration.

Full adapters are the recommended integration path.

A manual integration path may also exist for:

- existing host applications
- custom host initialization
- advanced users
- tests
- embedding Bunwire into another runtime
- situations where the developer intentionally owns host creation

`withContext()` exists primarily for this manual integration path.

It allows host/runtime context to be supplied directly when the adapter is not responsible for creating it.

The normal startup boundary is:

```ts
await app.start();
```

`start()` is responsible for orchestrating application startup according to the architecture.

Do not invent additional public initialization phases unless required by `docs/README.md` or `docs/MILESTONES.md`.

---

## Bootstrap Model

The application's bootstrap file is the composition root.

It should define and export the configured Application rather than starting it immediately.

Conceptually:

```ts
export default defineApp()
  .withAdapter(
    new SomeAdapter({
      // adapter configuration
    }),
  );
```

The actual host entrypoint imports that Application and starts it:

```ts
import app from "./bootstrap";

await app.start();
```

The bootstrap file may configure:

- adapters
- application-level options
- Providers where explicitly required
- middleware
- other documented Application configuration

Do not duplicate compiler-discovered Controllers, Services, Providers, managed classes, or managed methods manually if the architecture says they are automatically discovered.

The bootstrap defines the application.

`app.start()` starts the application.

Keep those responsibilities separate.

---

## Adapter Requirements

Adapters must be classes or class instances according to the public API described by the architecture.

An adapter may:

- receive configuration through its constructor
- receive/access the Bunwire Application when attached
- contribute Providers
- contribute managed class kinds
- contribute managed method kinds
- contribute parameter injectors
- contribute middleware or runtime integrations where appropriate
- create and own normal host-platform bootstrap
- produce host/adapter context
- bind or expose host runtime state
- consume generated registries
- expose native host objects to developer callbacks
- participate in startup orchestration

Adapters must not require changes to Core in order to introduce a new valid managed class kind or managed method kind when the extension API already supports it.

A future adapter should be capable of introducing concepts such as:

```ts
@Subscriber()
class UserEvents {
  @Listen("user.created")
  handle(...) {}
}
```

without adding adapter-specific branches to Core or the generic compiler.

Do not hard-code checks such as:

```ts
if (decorator === "Subscriber") {
  // ...
}
```

into Core compiler logic when the adapter extension system can represent the behavior declaratively.

---

## Provider Rules

Provider registration happens as part of application startup.

Adapter/host context must be available through the container at the point where Providers need it.

Adapter packages may contribute Providers in the same way application code does.

`Provider.register()` is application-startup behavior and is called once for the application lifecycle.

Its purpose is to establish runtime bindings and perform documented startup registration.

`Provider.boot()` is invocation-level behavior and may run for each managed request, message, event, job, or other invocation where applicable.

Do not add a separate Provider `init()` lifecycle unless the documented architecture is intentionally changed.

Application startup is orchestrated through `app.start()`.

Per-invocation state must not leak into the application/root scope.

Use the documented invocation scope or child-container mechanism for request-specific state.

Provider methods remain ordinary runtime TypeScript/JavaScript code.

Do not execute Provider lifecycle methods during compilation.

Do not build a static interpreter for arbitrary Provider logic.

---

## Binding Rules

Container registrations are bindings.

Examples may include:

- class bindings
- value bindings
- factory bindings
- alias bindings
- singleton bindings
- transient bindings
- invocation-scoped bindings where supported

Do not call these container entries "Providers."

A Provider may create bindings, but the binding itself is not a Provider.

Explicit runtime tokens should be used for dependencies that cannot be represented reliably by a runtime class identity, including interfaces, arbitrary values, and explicit aliases.

For example:

```ts
export const CACHE = createToken<Cache>("cache");
```

and:

```ts
@Inject(CACHE)
cache: Cache
```

The compiler should know that this parameter comes from the container.

It does not need to prove at compile time which Provider eventually creates the binding.

If the binding does not exist at runtime, the container should produce a useful resolution error.

---

## Managed Class Rules

Outer/class decorators opt classes into Bunwire's managed graph.

Built-in examples include:

- `@Service()`
- `@Controller()`
- `@Provider()`

Adapters may define additional managed class decorators.

Managed class kinds may configure behavior such as:

- injectability
- automatic registration
- constructor analysis
- method analysis
- generated registry participation
- lifecycle behavior
- adapter/runtime handling

A Service is not a Provider.

A Controller is not a Provider.

A Provider is not a container binding.

Maintain these distinctions throughout implementation, naming, tests, and documentation.

---

## Service Rules

Services represent ordinary backend/application business logic.

Services may use constructor dependency injection according to the managed-class DI rules.

Service methods are ordinary TypeScript/JavaScript methods.

Bunwire should not dynamically invoke Service methods merely because they are public.

Do not generate transport endpoints for Service methods unless an explicit future managed class/method extension defines such behavior.

---

## Controller and Managed Method Rules

Controllers and other adapter-defined managed class kinds may contain methods that Bunwire or an adapter dynamically invokes.

A public method is not automatically an endpoint.

Only methods explicitly marked with an applicable managed method decorator should be exposed to the corresponding runtime mechanism.

Examples may include:

- `@Route()`
- `@Message()`
- future `@Get()`
- future `@Post()`
- future `@Subscribe()`
- future `@Job()`

Core should provide generic machinery for managed methods.

Adapters give those methods platform-specific meaning.

---

## Parameter Injector Rules

Parameter decorators that supply runtime/framework values are parameter injectors.

Examples include:

```ts
@Inject(CACHE)
```

and adapter-defined injectors such as:

```ts
@Window()
@Webview()
@Context()
```

These are all conceptually framework-supplied parameters.

Their values may come from:

- the DI container
- adapter context
- invocation context
- platform/runtime state
- another registered resolver

Adapters may define their own parameter injectors.

Parameter injectors must be represented generically enough that a new adapter can add one without requiring Core compiler branches for that specific decorator.

Injected parameters are excluded from caller-facing transport signatures.

---

## Compiler and Generated Registry Rules

The compiler/Vite integration should perform discovery and analysis once and generate the runtime information Bunwire needs.

The source universe should be bounded by the Bunwire configuration described in `docs/README.md`, including the configured Bunwire source root.

The compiler should discover and analyze:

- managed classes
- managed class kinds
- constructor parameters
- managed methods
- method decorators
- method parameter decorators
- managed/injectable class dependencies
- explicit `@Inject()` dependencies
- adapter-defined parameter injectors
- caller-visible transport parameters
- generated registries
- generated invocation plans
- generated frontend contracts where applicable

For managed methods, distinguish:

- caller/transport-supplied parameters
- automatically container-injected managed class parameters
- explicitly token-injected parameters
- adapter/framework parameter injectors

Injected parameters are excluded from caller-visible generated contracts.

Caller-visible positional argument indexes are sequential and independent of actual method parameter indexes.

Example:

```ts
method(
  id: string,
  service: UserService,
  name: string,
  @Inject(CACHE) cache: Cache,
)
```

Actual method indexes are:

```text
id      -> 0
service -> 1
name    -> 2
cache   -> 3
```

Caller-visible indexes are:

```text
id   -> 0
name -> 1
```

The generated runtime invocation plan must reconstruct the complete method argument list correctly.

Conceptually:

```ts
args[0] = incoming[0];
args[1] = container.get(UserService);
args[2] = incoming[1];
args[3] = container.get(CACHE);

return controller.method(...args);
```

Injected parameters may appear anywhere in the method signature.

Do not force injected parameters to appear before or after caller-visible parameters.

Do not introduce manual `@Arg(index)` annotations for normal positional transport arguments.

The compiler already knows the actual parameter indexes and should assign caller-visible indexes automatically.

---

## Generated Client Rules

Generated frontend contracts should expose only caller-visible arguments.

Given:

```ts
@Route("get")
get(
  id: string,
  users: UserService,
  name: string,
) {}
```

the caller-facing contract should behave conceptually like:

```ts
request("users/get", id, name);
```

The injected `UserService` parameter must not be exposed to the caller.

Higher-level generated client ergonomics may be added according to the milestones, but the transport-style API documented by Bunwire must continue to work as intended.

---

## Testing Instructions

Every implemented milestone must include the tests required by `docs/MILESTONES.md`.

Add additional tests whenever necessary to prove behavior or prevent regressions.

Tests should verify behavior, not merely implementation details.

Where relevant, include:

- unit tests
- compiler fixture tests
- generated-output tests
- container/DI tests
- lifecycle tests
- adapter tests
- type-level tests
- runtime integration tests
- end-to-end tests
- monorepo package-boundary tests where useful

A milestone is not complete if its required behavior only works manually and has no appropriate automated test coverage.

Do not remove or weaken existing tests merely to make new code pass unless the previous test is demonstrably inconsistent with the current documented architecture.

Run the relevant test suites after changes.

Before declaring a milestone complete, run all tests required for that milestone and any broader regression suite that reasonably covers affected packages.

When a change affects shared Core or compiler behavior, verify relevant dependent adapter/example packages as well.

---

## Progress Tracking

Maintain two levels of implementation progress tracking:

1. a repository-root `progress.md` file containing the concise overall project status; and
2. a dedicated progress file for every milestone that has been started or completed.

Create a repository-root directory named:

`progress/`

Each milestone must have its own file using the milestone number, for example:

- `progress/milestone-00.md`
- `progress/milestone-01.md`
- `progress/milestone-02.md`

Use the milestone numbering from `docs/MILESTONES.md`.

Do not combine detailed implementation histories for multiple milestones into one milestone progress file.

### Main `progress.md`

The repository-root `progress.md` is the project-level index.

Keep it concise.

It should tell the repository owner or another agent:

- what has been implemented overall
- which milestones are complete
- which milestone is currently in progress
- what milestone comes next
- whether there are known blockers
- where to find the detailed progress record for each started or completed milestone

For every milestone that is in progress or complete, link to its dedicated progress file.

Use a structure similar to:

```md
# Bunwire Implementation Progress

## Current Status

Current milestone: Milestone 2 — <name>

Overall status:

- Milestone 0: Complete — [details](progress/milestone-00.md)
- Milestone 1: Complete — [details](progress/milestone-01.md)
- Milestone 2: In progress — [details](progress/milestone-02.md)
- Milestone 3+: Not started

## Implemented

- ...
- ...
- ...

## Current Work

- Milestone 2 — <name>
- ...
- ...

## Next

- Milestone 3 — <name>
- ...

## Blockers

- None

## Milestone Progress Files

- [Milestone 0](progress/milestone-00.md)
- [Milestone 1](progress/milestone-01.md)
- [Milestone 2](progress/milestone-02.md)
```

`progress.md` should not duplicate the full implementation history, complete test logs, or detailed acceptance-criteria notes contained in the milestone files.

Its purpose is to answer quickly:

- Where is the project now?
- What has already been implemented?
- What is being implemented now?
- What comes next?
- Where are the details?

Update `progress.md` whenever a milestone starts, changes status, completes, or when the next planned work changes.

### Milestone Progress Files

Create the dedicated progress file as soon as work on a milestone begins.

The milestone file is the detailed implementation record for that milestone.

For example, while implementing Milestone 2, maintain:

`progress/milestone-02.md`

The file must make it possible for the repository owner or another agent to understand the complete state of that milestone without reconstructing previous work.

Each milestone progress file should record:

- milestone name and number
- current milestone status
- packages changed
- requirements implemented
- requirements remaining
- acceptance criteria
- tests added
- tests run
- exact test results
- important implementation decisions
- architectural issues encountered
- deviations or unresolved questions
- known limitations
- expected working behavior after the milestone
- functionality intentionally not expected yet
- regressions checked
- any blockers
- what remains before the milestone can be declared complete

Use a structure similar to:

```md
# Milestone 2 — <name>

Status: In progress

## Packages Changed

- `packages/...`
- `packages/...`

## Implemented

- ...
- ...

## Remaining

- ...
- ...

## Acceptance Criteria

- [x] ...
- [ ] ...
- [ ] ...

## Tests Added

- ...
- ...

## Tests Run

- `...`
- `...`

## Test Results

- Passed: ...
- Failed: ...
- Skipped: ...

## Regression Checks

- ...
- ...

## Expected Behavior

After this milestone:

- ...
- ...

## Not Expected Yet

- ...
- ...

## Important Decisions

- ...
- ...

## Known Limitations

- ...
- ...

## Blockers

- None

## Next Work Within This Milestone

- ...
- ...
```

Do not update milestone progress only at the end.

Keep the current milestone's progress file updated as meaningful work is completed, tests are added or run, acceptance criteria change status, or implementation decisions are made.

When a milestone becomes complete:

1. mark its dedicated progress file as `Status: Complete`;
2. ensure all acceptance criteria are recorded and checked;
3. record the final tests and regression checks that establish completion;
4. record what the repository owner should now expect to work;
5. record what is intentionally left for later milestones; and
6. update `progress.md` to mark the milestone complete and point to the completed milestone file.

Never delete a completed milestone progress file merely because work has moved to a later milestone.

Completed milestone files are part of the project's implementation history.

When beginning the next milestone, create its dedicated progress file and update `progress.md` so it becomes the current milestone.

---

## Completion Discipline

Do not claim a milestone is complete merely because its main source files exist.

A milestone is complete only when:

1. its documented requirements are implemented;
2. its acceptance criteria are satisfied;
3. its required tests exist;
4. those tests pass;
5. relevant regressions have been checked;
6. affected workspace packages still build/test where applicable;
7. the milestone's dedicated progress file records the completed work, acceptance criteria, tests, and expected behavior; and
8. `progress.md` marks the milestone complete and links to that milestone progress file.

If a milestone cannot be completed, leave it marked as incomplete and document exactly what remains.

Do not conceal:

- failing tests
- incomplete functionality
- architectural compromises
- unresolved issues
- package-boundary violations
- known regressions

---

## Documentation Discipline

Treat `docs/README.md` and `docs/MILESTONES.md` as authoritative project documentation.

Implementation must remain consistent with them.

If implementation requires a genuine change to documented architecture, update the relevant documentation as part of the same change rather than allowing code and architecture documents to silently diverge.

Do not rewrite architectural decisions simply to fit an easier implementation.

Prefer changing the implementation to match the architecture unless there is a concrete technical reason the documented design cannot work.

Record significant architectural changes in the relevant milestone progress file, and summarize project-level consequences in `progress.md` when appropriate.

When changing public APIs, lifecycle behavior, adapter contracts, compiler behavior, package ownership, or generated output, verify whether `docs/README.md` or `docs/MILESTONES.md` must also be updated.

---

## Working Style

Make focused changes.

Avoid unrelated refactors while implementing a milestone.

Prefer clear, typed APIs over premature abstraction.

Do not add dependencies without a concrete need.

Do not introduce platform-specific concepts into Core.

Do not leave dead experimental implementations behind.

Do not duplicate generated information manually when the compiler can derive it reliably.

Do not bypass package public APIs merely because an internal import is easier.

Prefer useful error messages and diagnostics, especially around:

- unresolved bindings
- invalid managed decorators
- unsupported parameter injection
- invalid adapter registrations
- duplicate registrations
- startup misuse
- calling `start()` more than once
- missing context where context is required
- malformed managed method signatures
- invalid package/compiler configuration
- conflicting adapter extensions

Continue implementation until the current milestone's acceptance criteria are satisfied or a concrete blocker is reached.

When stopping work:

- ensure the current milestone's dedicated `progress/milestone-XX.md` file accurately describes the detailed repository state for that milestone;
- record packages changed, tests run, test results, acceptance-criteria status, expected working behavior, expected missing behavior, blockers, and exact remaining milestone work there; and
- ensure the repository-root `progress.md` accurately summarizes what has been implemented, which milestone is current, what is next, and links to every started or completed milestone progress file.
