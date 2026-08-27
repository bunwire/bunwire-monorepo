# Bunwire Implementation Progress

## Current Status

Current milestone: Milestone 14 — Core Events and Managed Listeners (complete)

Overall status:

- Milestone 0: Complete — [details](progress/milestone-00.md)
- Milestone 1: Complete — [details](progress/milestone-01.md)
- Milestone 2: Complete — [details](progress/milestone-02.md)
- Milestone 3: Complete — [details](progress/milestone-03.md)
- Milestone 4: Complete — [details](progress/milestone-04.md)
- Milestone 5: Complete — [details](progress/milestone-05.md)
- Milestone 6: Complete — [details](progress/milestone-06.md)
- Milestone 7: Complete — [details](progress/milestone-07.md)
- Milestone 8: Complete — [details](progress/milestone-08.md)
- Milestone 9: Complete — [details](progress/milestone-09.md)
- Milestone 10: Complete — [details](progress/milestone-10.md)
- Milestone 11: Complete — [details](progress/milestone-11.md)
- Milestone 12: Complete — [details](progress/milestone-12.md)
- Middleware Redesign 12A: Complete — [details](progress/milestone-12a.md)
- Middleware Redesign 12B: Complete — [details](progress/milestone-12b.md)
- Middleware Redesign 12C: Complete — [details](progress/milestone-12c.md)
- Middleware Redesign 12D: Complete — [details](progress/milestone-12d.md)
- Middleware Redesign 12E: Complete — [details](progress/milestone-12e.md)
- Middleware Redesign 12F: Complete — [details](progress/milestone-12f.md)
- Prior-milestone regression closure: Complete — [details](progress/prior-milestone-regression-closure.md)
- Milestone 13: Complete — [details](progress/milestone-13.md)
- Milestone 14: Complete — [details](progress/milestone-14.md)

## Implemented

- Optional/void managed class, method, and parameter decorators support equivalent bare and factory syntax (for example, `@Service` and `@Service()`) across runtime metadata and compiler discovery.
- Monorepo and mechanically enforced package boundaries.
- Generic managed-class metadata and decorator-definition APIs.
- Runtime DI container with explicit bindings, tokens, indexed constructor metadata, and singleton/transient scopes.
- Built-in Service, Controller, and Provider kinds and decorators implemented through the generic managed-class extension APIs.
- Instantiated Application/kernel lifecycle with Provider registries, explicit registration precedence, manual context, and isolated invocation scopes.
- Generic managed-method kinds, canonical class- and method-kind identity, strictly validated prebuilt parameter plans, custom resolver IDs, middleware, caller validation, and platform-independent invocation.
- Class-based primary-host adapters with guarded compiler/runtime contributions, prepared/manual host context, adapter-owned Providers, validation hooks, decorator-bound runtime registry consumers, native callbacks, and fake-adapter end-to-end proof.
- Declarative bounded Bunwire config, cycle-safe source discovery, default-export-anchored bootstrap analysis, ESM-authoritative adapter resolution, canonical extension aggregation, typed diagnostics, and the reserved `virtual:bunwire/*` namespace.
- Symbol-resolved managed-class discovery and indexed constructor DI plans with explicit token/class injection and strict plain-class/interface boundaries.
- Complete managed-method parameter plans with independent method/caller indexes, injector precedence, optional/rest semantics, caller bounds, and compile-time placement/source validation.
- Canonical compiler-symbol authorization, strict runtime-token validation, inherited-constructor safeguards, managed dependency-cycle detection, and concrete instance-method enforcement.
- Deterministic generated registries and `virtual:bunwire/registry`, with exported runtime imports, class scopes, constructor plans, generated Providers, managed methods, resolver IDs, adapter metadata, middleware arrays, stable hashes, and direct Core runtime execution.
- Full class-based Electrobun host integration with native RPC/window bootstrap, Route/Message dispatch, private wire-argument encoding, explicit manual request fallback, Window/Webview/Context injection, readiness gating, native bindings/callbacks/outgoing APIs, normalized endpoint paths, real-SDK compatibility verification, and a passing real native-process smoke gate.
- Generated positional request/message contracts and real Electrobun frontend schemas derived from authoritative invocation-plan indexes, with injected parameters excluded, private wire encoding, typed results, message `void`, canonical `@Use()` middleware, full normal/manual E2E paths, and a complete generated example.
- Core managed middleware foundation with canonical class identity, constructor DI, immutable definitions/attachments, transient invocation resolution, generic around-chain execution, strict runtime validation, and one shared Provider/Controller invocation scope.
- Compiler-discovered canonical middleware classes with exact-symbol authorization, strict class/handler and literal-metadata diagnostics, constructor DI/cycle analysis, duplicate-alias validation, and deterministic transient runtime definitions.
- Canonical Controller/method `@Use()` attachments with exact class/alias resolution, literal string-parameter parsing, deterministic Controller-first ordering, and immutable generated records.
- Compiler-only application middleware policy with static global stacks, forward/nested groups, source-root-relative Controller mappings, four-scope normalization, exact canonical deduplication, and fully resolved generated method pipelines.
- Electrobun managed-middleware execution with immutable native context, adapter-owned endpoint/transport filters, one invocation scope, request transformation/short circuit, message error routing, generated normal/manual parity, and real native-process coverage.
- Final attachment-only middleware model with all callback APIs/representations removed, migrated examples and fixtures, compiler-generated fake queue second-adapter proof, and clean public/built export audits.
- Post-review hardening rejects computed middleware-policy access fail-closed, validates caller bounds before invocation lifecycle side effects, and preserves `@Use()` runtime metadata across legacy and standard decorators.
- Prior-milestone regression closure adds nominal runtime tokens, constructable class-token validation, public generated import identities, host-aware path identity, exact virtual-module declarations, byte-stable shared artifact generation, and real Vite source/config invalidation.
- Milestone 13 prepares audited public `0.1.0` packages, exact export/tarball contracts, precise bootstrap diagnostics, a buildable fake second-adapter example, release documentation, deterministic performance/churn checks, and CI release gates without publishing or tagging.
- Milestone 14 adds canonical Core events and aliases, compiler-validated DI-managed listeners, deterministic generated relationships, and exact-identity sequential dispatch with isolated invocation scopes.
- All test definitions, clean-install automation, and fixtures centralized beneath `tests/`.

## Current Work

- None; Milestone 14 is complete.

## Next

- Future runtime packages may consume the completed Core event system for optional integrations such as queued listeners.

## Blockers

- None.

## Milestone Progress Files

- [Milestone 0](progress/milestone-00.md)
- [Milestone 1](progress/milestone-01.md)
- [Milestone 2](progress/milestone-02.md)
- [Milestone 3](progress/milestone-03.md)
- [Milestone 4](progress/milestone-04.md)
- [Milestone 5](progress/milestone-05.md)
- [Milestone 6](progress/milestone-06.md)
- [Milestone 7](progress/milestone-07.md)
- [Milestone 8](progress/milestone-08.md)
- [Milestone 9](progress/milestone-09.md)
- [Milestone 10](progress/milestone-10.md)
- [Milestone 11](progress/milestone-11.md)
- [Milestone 12](progress/milestone-12.md)
- [Middleware Redesign Milestone 12A](progress/milestone-12a.md)
- [Middleware Redesign Milestone 12B](progress/milestone-12b.md)
- [Middleware Redesign Milestone 12C](progress/milestone-12c.md)
- [Middleware Redesign Milestone 12D](progress/milestone-12d.md)
- [Middleware Redesign Milestone 12E](progress/milestone-12e.md)
- [Middleware Redesign Milestone 12F](progress/milestone-12f.md)
- [Prior-milestone regression closure](progress/prior-milestone-regression-closure.md)
- [Milestone 13](progress/milestone-13.md)
- [Milestone 14](progress/milestone-14.md)
