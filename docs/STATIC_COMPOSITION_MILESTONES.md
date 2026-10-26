# Bunwire Static Expressions and Modular Composition Milestones

Status: Project Milestones 15–21 are complete; Milestone 22 is not started.

Architecture: [README.md](README.md). Project roadmap: [MILESTONES.md](MILESTONES.md). Status index: [progress.md](progress.md).

These are project milestones following project Milestone 14, not the separately numbered `@bunwire/bun` milestones. This document specifies the track's target behavior; each milestone status distinguishes implemented and planned behavior. The remaining unsupported syntax retains its current restrictions until the corresponding milestone changes them and updates the authoritative architecture documentation.

## Purpose and completion target

Let developers reuse constants, compose middleware and schedules across feature files, and write bounded static loops while Bunwire continues to generate runtime registries without executing application code during compilation.

The target includes every rejected example discussed in the review: imported job policy constants, constant arithmetic, shared middleware arrays, spreads, computed mapping keys, imported policy helpers, repeated Application policy blocks, and `for...of` over known arrays. Decorated classes already supported in separate files must continue to work.

Complete this track in order. Each milestone must deliver exercised behavior and appropriate tests; an unused resolver or an untested API is not completion. A later milestone may depend on earlier infrastructure, but must not silently narrow an earlier acceptance criterion.

## Ownership and architectural gates

| Responsibility | Owner |
|---|---|
| Expression resolution, symbol lookup, helper expansion, provenance, dependency collection | `@bunwire/vite` |
| Application configuration lifecycle and repeated policy calls | `@bunwire/core` |
| Meaning and validation of queue policies, cron, HTTP filters, and host metadata | The contributing adapter or owning Core feature |
| Regression proof | Bun, Electrobun, generic adapter fixtures, and generated application tests |
| Implementation history | Separate project milestone progress files |

- Core remains platform-independent and does not acquire a TypeScript evaluator or Vite dependency.
- Generic compiler code must not branch on Bun jobs, cron, HTTP, Electrobun, or individual adapter decorator names.
- Do not import application modules, instantiate managed classes, invoke application helpers, execute policy callbacks, or run Provider lifecycle code during compilation.
- Existing authorized compiler descriptors and metadata handlers retain their established execution contracts. This track does not claim that loading compiler tooling has zero module initialization effects.
- Preserve canonical decorator/class/token authorization, explicit injection semantics, caller argument positions, runtime scopes, and generated registry ownership.
- Static expansion must terminate. Unsupported syntax produces an actionable diagnostic; it never falls back to application execution.
- Runtime consumes generated records. It does not repeat policy discovery or static expansion.
- Do not add a required helper registration API, decorator, or wrapper for ordinary typed policy helper functions.
- Do not expand `bunwire.config.*` parsing, adapter-constructor discovery, or the recognized default-exported Application composition-root shape in this track.
- Durable storage drivers, CLI/scaffolding, the sibling validation repository, arbitrary Provider analysis, and a general JavaScript interpreter are excluded.

## Static language contract

### Values, references, and source boundaries

Use one shared resolver for supported values. It returns the resolved value or canonical reference, its source provenance, and the files required to derive it. Keep canonical classes and tokens distinct from ordinary serialized data. A string matching a class name never authorizes that class.

Resolve symbols through the TypeScript program, including lexical shadowing, import aliases, namespace members, and re-export chains. Follow source declarations rather than trusting inferred literal types or declaration-only types as runtime values.

Application constant/helper source must be available to the TypeScript program and remain within the configured project root after canonical path resolution. Project-local imported dependency files may be outside the managed source roots; reading them does not opt their classes into automatic discovery. Arbitrary dependency-package helper bodies, ambient declarations, dynamic imports, and external source escapes remain unsupported. Existing public package symbols for authorized classes/decorators/tokens continue through the established symbol-resolution path.

Compiled metadata is a snapshot of supported initializers. Metadata mutation is unsupported. Reject detected writes through resolved aliases, property assignments, and mutating calls affecting consumed values within the analyzed graph. Do not claim whole-program mutation proof or imply that `const`, `readonly`, or `as const` freezes runtime JavaScript values. Document that later runtime mutation cannot reconfigure generated metadata; retain existing runtime agreement checks where applicable.

| Syntax | Planned behavior |
|---|---|
| Strings, numbers, booleans, null, undefined | Preserve existing literal support; the consuming metadata validator determines whether a value is valid there |
| Parentheses, type assertions, `as const`, `satisfies` | Unwrap syntax without using type assertions to bypass validation |
| Local/imported `const`, aliases, re-exports | Resolve supported initializers and track dependencies |
| Arrays, objects, array/object spreads | Expand supported collections in source order; reject holes and unsupported elements |
| Own-property reads and computed keys | Resolve known own properties; keys must resolve to strings or numbers; no prototype traversal/getters |
| Unary numeric `+` and `-` | Evaluate finite numeric operands |
| Numeric `+`, `-`, `*`, `/`, `%`, `**` | Evaluate finite numbers; reject non-finite results; consumers enforce integer/range requirements |
| String `+` | Concatenate strings only; reject implicit mixed-type coercion |
| Canonical class references in policy collections | Preserve symbol identity and validate targets at the consuming boundary |
| Supported synchronous policy helpers | Expand bodies statically at their call sites |
| Repeated policy methods in the exported Application chain | Compose in chain order, retaining policy-specific validation |
| Synchronous `for (const item of knownArray)` | Expand in array order with an identifier loop binding and fixed limits |
| Arbitrary calls, getters, `new`, environment reads, async work | Reject as static values/helper operations |
| General `for`, `while`, `for await`, conditional control flow | Deferred; reject clearly in policy bodies |

Ordinary object composition follows source-order overwrite semantics: later explicit properties/spreads replace earlier keys. Use safe own-property handling for names such as `__proto__`. This does not relax policy-level uniqueness rules for group declarations, event aliases, or schedule IDs. A missing own property or invalid key is a diagnostic rather than prototype lookup.

Internal budgets are fixed for this track: recursive resolution/expansion depth at most 64, at most 100,000 evaluated nodes per compilation, and at most 10,000 emitted policy declarations per compilation. Count repeated expansion work, not only distinct AST nodes. Report which budget was exceeded and the expansion path. Do not expose a public configuration knob in this track.

### Helpers and composition

Support named function declarations and `const` arrow/function expressions with synchronous block bodies. Resolve imported, aliased, and re-exported helpers by symbol. Support identifier parameters, arguments from the supported expression language, lexical constants, local `const` declarations, direct policy calls, and nested supported helper calls. Reject destructured/default/rest parameters, value-returning helpers, assignments, escaping registry callbacks, async/generator bodies, `this`-dependent operations, and recursive call chains in this first version. Ordinary application functions outside these analyzed policy bodies are unaffected.

A supported named function may also be passed directly to `withMiddlewares()` or `withSchedule()`. Registry parameters represent the appropriate compiler policy builder, not arbitrary runtime objects. Keep TypeScript checking and method validation active. A middleware helper cannot use schedule methods, and vice versa.

Expansion occurs depth-first at the original call site. Repeated calls expand repeatedly; existing canonical middleware deduplication still applies after normalization. Repeated schedule IDs remain errors. Collect all middleware groups across all blocks before resolving references, allowing forward references while rejecting duplicate names and cycles.

Middleware precedence remains global → Controller mapping → Controller `@Use()` → method `@Use()`. Within each applicable layer, preserve existing source ordering, exact canonical deduplication, and parameter-distinct attachments. Schedule block composition preserves chain and statement order; existing deterministic registry serialization remains authoritative.

### Developer acceptance examples

The following are target syntax after their respective milestones, not claims about current support. Normal imports and adapter configuration are omitted where they do not illustrate the feature.

```ts
// queues/constants.ts
export const CRITICAL_QUEUE = "critical-billing";
export const STANDARD_BACKOFF = [1_000, 5_000, 30_000];

// jobs/charge-card.ts
import { CRITICAL_QUEUE, STANDARD_BACKOFF } from "../queues/constants";

@Job({ id: "billing.charge" })
export class ChargeCardJob {
  protected queue = CRITICAL_QUEUE;
  protected backoff = STANDARD_BACKOFF;
  protected timeout = 60 * 1000;
  async handle(orderId: string) {}
}
```

```ts
const COMMON_SECURITY = ["csrf", "auth", "audit:strict"] as const;
const ADMIN_GLOB = "controllers/admin/**";

// audit and the referenced authorization policy must actually exist.
.withMiddlewares((registry) => {
  registry.group("web", COMMON_SECURITY);
  registry.group("admin", [...COMMON_SECURITY, "can:admin.access"]);
  registry.controllers({ [ADMIN_GLOB]: "admin" });
})
```

```ts
// billing/schedule.ts
export function registerBillingSchedules(schedule: ApplicationScheduleRegistry) {
  schedule.job(ReconcileInvoicesJob, "daily")
    .dailyAt("02:00").id("billing.reconcile");
  schedule.job(SendDunningEmailsJob)
    .hourlyAt(15).id("billing.dunning");
}

// bootstrap.ts: inside the configured exported Application chain
.withSchedule((schedule) => {
  registerBillingSchedules(schedule);
})
.withSchedule((schedule) => {
  registerAnalyticsSchedules(schedule);
})
```

```ts
const jobs = [GenerateDailyReport];

.withSchedule((schedule) => {
  for (const job of jobs) {
    schedule.job(job).dailyAt("04:00");
  }
})
```

Rejected examples must include `fetch(...)`, `process.env.QUEUE` in compiled metadata, `getQueueName()` as an arbitrary value factory, recursive policy helpers, and loops over runtime collections. Their rejection must explain the unsupported operation, not merely report malformed syntax.

## Milestone sequence

| Milestone | Deliverable | Dependency | Status |
|---|---|---|---|
| 15 | Shared static expression resolver | Completed project baseline | Complete |
| 16 | Expressions throughout managed metadata | 15 | Complete |
| 17 | Composable middleware and schedule values | 16 | Complete |
| 18 | Static policy helpers across files | 17 | Complete |
| 19 | Multiple Application policy blocks | 18 | Complete |
| 20 | Bounded static `for...of` expansion | 19 | Complete |
| 21 | Dependency invalidation and diagnostic integration | 20 | Complete |
| 22 | Cross-package hardening and completion | 21 | Planned |

Earlier milestones collect dependencies and provenance immediately; Milestone 21 completes their development-server integration. Helpers and expression APIs remain internal compiler infrastructure unless a public analysis result must expose dependency information for the plugin.

---

# Milestone 15 — Shared Static Expression Resolver

Status: Complete. See [implementation record](progress/milestone-15.md).

## Goal and packages affected

Create one bounded resolver in `@bunwire/vite` that produces values/references, source origins, and dependencies without executing application code. Require direct resolver fixtures before broad integration in Milestone 16.

## Implementation steps

1. Define internal result and diagnostic structures separating static data from canonical symbol references.
2. Resolve the supported expression forms and symbol chains described above. Cache per-analysis results without losing source origins or alias-specific diagnostics.
3. Resolve declarations inside the allowed project boundary and track every source/re-export dependency.
4. Add recursion detection, fixed budgets, safe object-key handling, and detection of unsupported mutation involving consumed constants.
5. Retain existing consumer validation and avoid applying this resolver to configuration/bootstrap adapter discovery.
6. Document the expression grammar and unsupported cases in the milestone progress record and relevant compiler guide.

## Required automated tests

- [x] **[Automated / Unit]** Literals, wrappers, numeric separators, every supported operator, string concatenation, and finite-result handling.
- [x] **[Automated / Unit]** Nested arrays/objects, spread precedence, computed keys, own-property reads, missing properties, special keys, and sparse-array rejection.
- [x] **[Automated / Compiler Fixture]** Local/imported constants, namespace references, import aliases, re-export chains, lexical shadowing, and `as const`/`satisfies`.
- [x] **[Automated / Compiler Fixture]** Reject cycles, ambient declarations, mutable bindings, detected alias writes/mutating calls, arbitrary calls, getters, source escapes, and unsupported coercion.
- [x] **[Automated / Behavioral]** Top-level side effects in parsed application modules are not executed during resolution.
- [x] **[Automated / Unit]** Exact-limit and over-limit inputs terminate with deterministic budget diagnostics; cache reuse cannot evade budgets.
- [x] **[Automated / Architecture]** The resolver is confined to compiler tooling and adds no runtime dependency to Core.

## Acceptance criteria and completion gate

- [x] Equivalent supported expressions produce equivalent values and preserve canonical references.
- [x] Dependency/provenance results include intermediate re-export files.
- [x] Errors identify the unsupported expression and reference chain.
- [x] Resolution never imports or executes application code and terminates within the defined limits.
- [x] Required tests pass and results are recorded in the dedicated milestone progress file.

Expected behavior: the resolver is verified through real TypeScript-program fixtures. Not expected yet: every metadata consumer accepts the expanded language, policy helpers, repeated blocks, loops, or complete HMR dependency handling.

---

# Milestone 16 — Expressions Throughout Managed Metadata

Status: Complete. Depends on Milestone 15. See [implementation record](progress/milestone-16.md).

## Goal and packages affected

Integrate the resolver throughout relevant managed metadata in `@bunwire/vite`, with Core-owned metadata and Bun/Electrobun/fake-adapter verification. Adapter runtime changes are necessary only if a concrete integration failure establishes a need.

## Implementation steps

1. Inventory and replace direct-value parsing for registered decorator arguments, parameter-injector metadata where applicable, class attachments, compiled protected fields, event aliases, middleware metadata, and string-valued `@Use()` references.
2. Keep class/token arguments on the canonical symbol path. Do not convert class identities into names or infer runtime tokens from literal types.
3. Apply existing feature/adapter validators to resolved values so expanded syntax does not weaken schema constraints.
4. Preserve agreement between generated records and runtime decorator metadata; reject unsupported mutated metadata rather than silently emitting contradictory records.
5. Update direct-literal restrictions in architecture and compiler/adapter documentation for the integrated consumers.

## Required automated tests

- [x] **[Automated / Compiler Fixture]** The exact imported queue/backoff constants and `60 * 1000` job example compile to the expected policy.
- [x] **[Automated / Compiler Fixture]** Imported event/middleware aliases, include/exclude/only/except arrays, decorator options, parameter-injector options, and class attachment data resolve where valid.
- [x] **[Automated / Compiler Fixture]** Invalid resolved values, conflicting aliases, counterfeit symbols, invalid tokens, mutation, and unauthorized class kinds remain rejected.
- [x] **[Automated / Generated Output]** Literal and expression-based declarations generate equivalent runtime metadata, canonical imports, and invocation plans.
- [x] **[Automated / Integration]** A generated Bun job executes with the intended queue, timeout, and retry policy.
- [x] **[Automated / Integration]** Electrobun and a generic fake adapter consume expression-derived metadata without compiler branches for their semantics.
- [x] **[Automated / Type-level]** Existing caller-visible signatures and DI exclusions remain correct.

## Acceptance criteria and completion gate

- [x] Every listed metadata consumer uses consistent expression rules; exceptions are limited to documented canonical-identity handling.
- [x] All quoted job metadata examples work through compilation and generated runtime integration.
- [x] Existing metadata validation and canonical authorization remain intact.
- [x] Required tests and impacted package checks pass and are recorded.

Expected behavior: shared static values work throughout managed metadata. Not expected yet: collection composition in central policies, helper expansion, multiple policy blocks, or loops.

---

# Milestone 17 — Composable Middleware and Schedule Values

Status: Complete. Depends on Milestone 16. See [implementation record](progress/milestone-17.md).

## Goal and packages affected

Extend both central policy parsers in `@bunwire/vite` to accept supported values and collections while preserving their current semantic validators. Verify Bun schedules and cross-adapter middleware.

## Implementation steps

1. Resolve middleware arrays, group names, mapping objects, object spreads, and computed controller keys through the shared resolver.
2. Support spread arguments where the policy method accepts a known positional sequence; validate arity after expansion.
3. Resolve schedule arguments, cadence values, IDs, timezones, and modifiers before invoking the generic adapter schedule handler.
4. Preserve canonical classes in collections, then apply target-kind, caller-arity, and payload validation.
5. Keep group expansion, Controller mapping validation, middleware ordering/deduplication, cadence rules, and schedule uniqueness unchanged.

## Required automated tests

- [x] **[Automated / Compiler Fixture]** All `COMMON_SECURITY` and `ADMIN_GLOB` review examples compile, with real referenced middleware/policies.
- [x] **[Automated / Compiler Fixture]** Imported mapping objects, object spreads, mixed class/alias middleware arrays, and known argument spreads work.
- [x] **[Automated / Compiler Fixture]** Schedule arguments, times, timezones, IDs, and modifiers resolve from supported expressions.
- [x] **[Automated / Compiler Fixture]** Reject invalid globs, unknown middleware, group cycles, duplicate schedule IDs, invalid cadence values, wrong job arity, and nonserializable job payloads.
- [x] **[Automated / Generated Output]** Equivalent composed and inline policies emit equivalent metadata.
- [x] **[Automated / Integration]** Middleware execution order and delivered scheduled-job arguments match the declared policy.

## Acceptance criteria and completion gate

- [x] Shared arrays, spreads, and computed mapping keys work in their supported policy positions.
- [x] Resolved values receive the same validation as inline values.
- [x] Errors retain the source location of the invalid value, including imported declarations.
- [x] Required tests and dependent adapter checks pass and are recorded.

Expected behavior: central callbacks accept reusable values and collections. Not expected yet: function helpers, multiple callbacks, or loops.

---

# Milestone 18 — Static Policy Helpers Across Files

Status: Complete. Depends on Milestone 17. See [implementation record](progress/milestone-18.md).

## Goal and packages affected

Enable domain-owned middleware/schedule declarations through ordinary typed helper functions, implemented in `@bunwire/vite` and exercised through existing Core callback types.

## Implementation steps

1. Resolve supported function declarations and constant function expressions by symbol, including imports and re-exports.
2. Bind identifier parameters to static arguments or the appropriate registry capability, retaining lexical scope and source origins.
3. Expand supported local constants, direct policy statements, and nested helper calls depth-first at each call site.
4. Accept a supported named function directly as the Application policy callback.
5. Reject recursion, unknown function targets, registry misuse/escape, unsupported parameters/body statements, and arbitrary value factories.
6. Preserve TypeScript signature checking and add diagnostics showing both the helper definition and calling declaration.

## Required automated tests

- [x] **[Automated / Compiler Fixture]** Imported `registerBillingSchedules(schedule)` and analogous middleware-group helpers produce the intended declarations.
- [x] **[Automated / Compiler Fixture]** Named callbacks, local arrows/functions, nested helpers, aliases/re-exports, lexical constants, parameter substitution, and shadowing work.
- [x] **[Automated / Compiler Fixture]** Repeated helper calls expand in order and preserve existing duplicate-policy errors.
- [x] **[Automated / Compiler Fixture]** Reject direct/indirect recursion, async/generator helpers, dynamic targets, wrong arity, registry escape, wrong registry methods, and unsupported statements.
- [x] **[Automated / Behavioral]** Application module side effects and helper bodies are never executed by compilation; verify through an external sentinel around analysis, not a function that must be invoked to inspect the result.
- [x] **[Automated / Generated Output]** Helper-based policy records match equivalent inline records.
- [x] **[Automated / Type-level]** Public registry callback types support the ordinary typed helper examples without an additional registration API.

## Acceptance criteria and completion gate

- [x] Domain helper files compose both policy types without runtime execution.
- [x] Every expansion preserves canonical identity, lexical bindings, source order, and validation.
- [x] Unsupported helper constructs produce precise call-path diagnostics.
- [x] Required tests pass and results are recorded.

Expected behavior: one policy block can compose supported domain helpers, or use a named callback directly. Not expected yet: multiple Application blocks or iteration.

---

# Milestone 19 — Multiple Application Policy Blocks

Status: Complete. Depends on Milestone 18. See [implementation record](progress/milestone-19.md).

## Goal and packages affected

Change Core's public `withMiddlewares()` and `withSchedule()` configuration rules and Vite's policy collection so repeated calls compose predictably.

## Implementation steps

1. Remove only the once-only guard for these two methods. Preserve callback type validation, fluent return values, and configuring-state enforcement.
2. Continue neither retaining nor executing policy callbacks in Core.
3. Collect all relevant calls from the existing exported Application receiver chain in chain order. Do not scan unrelated chains or dormant helper code as application policy.
4. Aggregate middleware groups before expansion, allowing forward references across blocks but rejecting duplicate names and cross-block cycles.
5. Preserve middleware precedence and existing exact canonical deduplication after aggregation.
6. Validate schedule IDs across the complete composed policy. Repeated declarations do not silently override one another.
7. Update Core API documentation and the architecture's configuring/once-only descriptions in the same implementation change.

## Required automated tests

- [x] **[Automated / Behavioral]** Repeated Core configuration calls succeed before startup and return the same Application.
- [x] **[Automated / Behavioral]** Invalid callbacks and configuration after startup/shutdown remain rejected; callbacks are never executed or retained as runtime work.
- [x] **[Automated / Compiler Fixture]** Multiple blocks, imported helpers across blocks, forward group references, and interleaved schedule/middleware calls compose correctly.
- [x] **[Automated / Compiler Fixture]** Duplicate groups, cross-block cycles, duplicate schedule IDs, and malformed chain access remain errors; unrelated chains are ignored.
- [x] **[Automated / Integration]** Middleware executes in the documented layered order and generated schedules contain every valid composed declaration.
- [x] **[Automated / Generated Output]** Previously valid single-block applications retain equivalent generated behavior.

## Acceptance criteria and completion gate

- [x] Both repeated APIs work through Core and Vite with one documented composition contract.
- [x] Duplicate behavior and ordering are tested across blocks and helper boundaries.
- [x] Current architecture and API docs describe repeated configuration accurately.
- [x] Core, compiler, and affected adapter checks pass and are recorded.

Expected behavior: multiple policy blocks compose. Not expected yet: static iteration or complete imported-dependency HMR coverage.

---

# Milestone 20 — Bounded Static for...of Expansion

Status: Complete. Depends on Milestone 19. See [implementation record](progress/milestone-20.md).

## Goal and packages affected

Allow policy callbacks/helpers to iterate over statically known arrays using a bounded compiler expansion in `@bunwire/vite`.

## Implementation steps

1. Accept synchronous `for (const item of expression)` with one identifier binding and a block body; resolve the expression to a known array.
2. Create a lexical binding per iteration and expand supported policy statements, local constants, helpers, and nested bounded loops.
3. Preserve array order and canonical class references. An empty array emits no declarations.
4. Count all repeated evaluation and emitted declarations toward the shared budgets; reject overflow without producing a partial successful registry.
5. Reject `for await`, general loops, unknown iterables, mutation, destructured loop bindings, `break`, `continue`, and unsupported conditional control flow.

## Required automated tests

- [x] **[Automated / Compiler Fixture]** The previously rejected shared job-array example compiles and emits the intended schedule.
- [x] **[Automated / Compiler Fixture]** Empty/imported arrays, nested loops, helper calls inside loops, loops inside helpers, and lexical shadowing work.
- [x] **[Automated / Compiler Fixture]** Loop-bound middleware/job classes preserve canonical identity; invalid targets cannot become authorized through iteration.
- [x] **[Automated / Compiler Fixture]** Reject unsupported iteration forms, mutable bindings, runtime collections, mutation, and recursive helper/loop combinations.
- [x] **[Automated / Unit]** Exactly 10,000 emitted declarations are within the declaration budget; 10,001 exceed it. Test other budgets independently with suitable fixtures.
- [x] **[Automated / Generated Output]** Expanded declarations match equivalent inline policy, including duplicate errors and order.
- [x] **[Automated / Behavioral]** Loop expansion never invokes application code.

## Acceptance criteria and completion gate

- [x] Supported loops work in both callbacks and helper bodies.
- [x] Empty and nested loops behave predictably within the fixed budgets.
- [x] Overflow and unsupported loops produce actionable diagnostics without successful partial output.
- [x] Required tests pass and results are recorded.

Expected behavior: all agreed syntax forms are accepted in direct compilation. Not expected yet: general JavaScript control flow or automatic dependency invalidation for every new source relationship.

---

# Milestone 21 — Dependency Invalidation and Diagnostic Integration

Status: Complete. Depends on Milestone 20. See [implementation record](progress/milestone-21.md).

## Goal and packages affected

Make expression/helper dependencies reliable in Vite development and manual generation, with useful source chains in compiler diagnostics. Ownership remains in `@bunwire/vite`.

## Implementation steps

1. Propagate all consumed constants, helpers, and re-export intermediates into analyzed application dependency results.
2. Register dependencies with Vite/Rollup watchers and invalidate analysis on edits, removals, and dependency changes. Recompute the dependency set after reanalysis.
3. Preserve configured discovery boundaries: watching an imported dependency must not opt all classes in its directory into discovery.
4. Preserve generated-output exclusion and byte-identical write avoidance; changes must not create self-triggered rebuild loops.
5. Surface invalid changed source through existing error paths and recover when fixed; do not silently report stale artifacts as newly successful output.
6. Add optional structured related locations to compiler errors for declaration/reference/helper/iteration origins, retaining existing error-code categories and primary locations.
7. Make manual artifact generation and Vite use the same analysis and dependency semantics.

## Required automated tests

- [x] **[Automated / Integration]** Real Vite changes to imported constants, helper bodies, and intermediate re-export files regenerate the affected metadata and invalidate relevant modules.
- [x] **[Automated / Integration]** Deleting a dependency produces a diagnostic; restoring/fixing it recovers without restarting the compiler session.
- [x] **[Automated / Integration]** Changing an import/helper dependency refreshes the watched dependency set and does not reuse stale analysis.
- [x] **[Automated / Integration]** Referenced project-local files outside managed source roots are watched without expanding automatic discovery.
- [x] **[Automated / Generated Output]** Unchanged generation preserves file bytes and avoids writes; generated files never cause watch feedback.
- [x] **[Automated / Compiler Fixture]** Nested expression/helper/loop failures expose primary and related locations, including paths containing spaces.
- [x] **[Automated / Integration]** Existing config/bootstrap/source/page watching and manual artifact generation remain correct.

## Acceptance criteria and completion gate

- [x] Every supported source relationship participates in invalidation and recovery.
- [x] Compiler errors remain actionable across file and helper boundaries.
- [x] Manual and Vite paths agree on records and diagnostics.
- [x] Required real watcher and regression checks pass and are recorded.

Expected behavior: the complete syntax works during iterative development. Not expected yet: final cross-package release verification, which belongs to Milestone 22.

---

# Milestone 22 — Cross-Package Hardening and Completion

Status: Planned. Depends on Milestone 21.

## Goal and packages affected

Prove the entire feature through generated applications, verify affected packages, and finalize architecture, examples, compiler guides, and progress records. Cover `@bunwire/core`, `@bunwire/vite`, `@bunwire/bun`, Electrobun, and generic adapter fixtures according to impact.

## Implementation steps

1. Add a representative generated application combining imported job metadata, spread middleware groups, computed mappings, helper modules, repeated blocks, and bounded iteration.
2. Verify runtime middleware order, scheduled job arguments, compiled retry/timeout policy, and normal DI/lifecycle behavior.
3. Exercise equivalent generic facilities with Electrobun and a fake adapter to prove shared ownership.
4. Finalize accepted/rejected syntax tables and migration examples. Document fixed budgets, source boundaries, mutation limitations, and helper restrictions.
5. Audit public exports, generated declarations, canonical identity, package boundaries, source dependency handling, and runtime absence of static evaluation.
6. Preserve historical progress records. Explain superseded restrictions in this track's records and update current architecture descriptions alongside actual behavior.
7. Run the final regression checkpoint, recording exact results and resolving required failures before marking completion.

## Required automated tests

- [ ] **[Automated / E2E]** A real Bun process consumes generated artifacts and exercises scheduling, queue dispatch, middleware, and job policy using the new syntax. Use existing supported test drivers; durable storage is not a prerequisite.
- [ ] **[Automated / Integration]** Electrobun metadata, invocation, and middleware behavior remain correct with composed policies.
- [ ] **[Automated / Integration]** A generic adapter consumes the same expression/helper facilities without concrete adapter branches in compiler code.
- [ ] **[Automated / Architecture]** Package boundaries hold; application helpers/Providers are not executed during analysis; runtime packages do not acquire static evaluators.
- [ ] **[Automated / Type-level]** Helper signatures, canonical targets, scheduled arguments, Application methods, and caller-visible contracts remain sound.
- [ ] **[Automated / Generated Output]** Repeated runs and equivalent declaration forms preserve deterministic metadata, imports, and hashes where semantic ordering is identical.
- [ ] **[Automated / Build]** Root `pnpm quality` passes, covering boundaries, typechecking, Electrobun SDK contracts, the full test suite, workspace builds, and built exports.
- [ ] **[Automated / Build]** `pnpm test:release-pack` and `pnpm test:clean-install` pass.
- [ ] **[Automated / E2E]** Run `pnpm test:electrobun-native` for the changed generated middleware/metadata path; record any concrete environment blocker rather than claiming it passed.
- [ ] **[Automated / Behavioral]** Existing performance sanity checks plus bounded-expansion fixtures show no runaway evaluation or rebuild churn; record measurements without inventing an unsupported speed guarantee.

## Acceptance criteria and completion gate

- [ ] Every agreed rejected example has an automated test demonstrating accepted syntax and intended generated behavior.
- [ ] Required runtime scenarios pass, including representative Bun, Electrobun, and generic adapter coverage.
- [ ] All required quality/release checks pass; a missing required gate leaves the milestone incomplete with a concrete blocker.
- [ ] No runtime rediscovery, application-code execution during analysis, or platform-specific compiler branch was introduced.
- [ ] Current architecture/package documentation agrees with implemented syntax and public configuration behavior.
- [ ] All eight milestone records and the project index accurately describe completion, evidence, and exclusions.

Expected behavior: the full static composition language is usable through manual generation and Vite, across managed metadata and policy consumers. Intentionally unsupported: general JavaScript execution/control flow, dynamic metadata, arbitrary package helper evaluation, config/adapter-discovery expansion, and runtime mutation of compiled metadata.

## Cross-milestone test matrix

| Capability | First required | Required evidence |
|---|---|---|
| Literal/constant resolution and arithmetic | 15 | Unit, compiler fixture, non-execution behavioral tests |
| Spreads, object keys, symbol/reference provenance | 15 | Unit and compiler fixtures |
| Job/event/middleware/adapter metadata | 16 | Compiler fixtures, generated output, integration |
| Canonical identity and DI/caller boundaries | 16 | Negative fixtures, type-level and integration regressions |
| Central policy collections and arguments | 17 | Compiler fixtures, output equivalence, runtime integration |
| Imported helpers and named callbacks | 18 | Positive/negative fixtures, side-effect sentinels, type checks |
| Multiple Application blocks | 19 | Core behavior, cross-block fixtures, runtime ordering |
| Bounded iteration and budgets | 20 | Boundary tests, fixtures, output equivalence |
| Imported dependency HMR and recovery | 21 | Real Vite watcher integration and manual-generation parity |
| Cross-package release behavior | 22 | E2E, architecture, build, export, clean-install checks |

## Final end-to-end acceptance scenario

1. A billing module exports queue/retry constants and supported schedule/middleware helpers. A separate module re-exports them.
2. A job uses those constants and arithmetic in protected metadata. Middleware declarations use shared arrays and computed Controller mappings.
3. The bootstrap composes multiple policy blocks, imported helpers, and a bounded loop over canonical job classes.
4. Generation succeeds without executing application module side effects or helper callbacks. Generated records contain the resolved values and canonical identities.
5. A running generated Bun application executes the intended middleware and scheduled job with correct arguments, retry policy, and DI scope. Equivalent generic/Electrobun fixtures verify shared compiler behavior.
6. Editing the re-exported constant or helper regenerates the relevant output through Vite; unchanged regeneration does not rewrite artifacts.
7. An invalid value, recursive helper, excessive expansion, or deleted dependency produces a useful diagnostic. Fixing the source restores successful generation.

## Test execution and progress discipline

Use the existing centralized `tests/` conventions: place new project tests under `tests/milestone-15` through `tests/milestone-22` and corresponding fixture directories under `tests/fixtures/`. Reuse existing integration harnesses and package public APIs; do not copy adapter implementations into tests to avoid real integration.

During development run the directly associated tests first, for example `pnpm exec vitest run tests/milestone-15`. Expand to existing impacted suites as consumers change. Track tests already passed and rerun them only when subsequent changes reasonably affect them. Shared compiler/Core changes warrant dependent adapter regression checks. Do not rerun the entire suite after each edit; use the broad final checkpoint in Milestone 22 and earlier broad checks only when concrete impact requires them.

Convert obsolete rejection tests only as the corresponding syntax becomes implemented, replacing them with meaningful positive behavior tests and preserving rejection coverage for genuinely unsupported dynamic syntax. Tests must verify output/runtime behavior, not merely that a parser returns an object.

On starting each milestone, create its own `docs/progress/milestone-XX.md` and update the project index. Record packages changed, requirements implemented/remaining, checked acceptance criteria, tests added, exact commands and results, regressions, architectural decisions/conflicts, expected working/missing behavior, blockers, and remaining work. Keep these records current throughout implementation.

Completion requires implementation, passing required tests, affected package verification, accurate current documentation, a complete dedicated progress record, and an updated project index. Preserve completed records. If a gate cannot run or fails, record it precisely and leave the milestone incomplete.

## Documentation-task verification

Creating this roadmap does not begin implementation. Its own completion requires:

- [x] This document contains all eight milestones, required tests, acceptance criteria, and explicit exclusions.
- [x] `MILESTONES.md` links this track and identifies project numbering 15–22.
- [x] `progress.md` marks the track planned and identifies Milestone 15 as next work.
- [x] Relative links resolve and milestone numbering is consistent.
- [x] No implementation milestone is marked started/complete and no implementation test results are claimed by this documentation change.

Verification: all relative file links in the three changed documents resolve; milestones 15–22 each contain ownership, implementation steps, classified tests, acceptance criteria, and planned status. This documentation-only task did not run implementation tests.
