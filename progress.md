# Bunwire Implementation Progress

## Current Status

Current milestone: None; Milestone 6 — Class-Based Adapter and Extension API is complete

Overall status:

- Milestone 0: Complete — [details](progress/milestone-00.md)
- Milestone 1: Complete — [details](progress/milestone-01.md)
- Milestone 2: Complete — [details](progress/milestone-02.md)
- Milestone 3: Complete — [details](progress/milestone-03.md)
- Milestone 4: Complete — [details](progress/milestone-04.md)
- Milestone 5: Complete — [details](progress/milestone-05.md)
- Milestone 6: Complete — [details](progress/milestone-06.md)
- Milestone 7+: Not started

## Implemented

- Monorepo and mechanically enforced package boundaries.
- Generic managed-class metadata and decorator-definition APIs.
- Runtime DI container with explicit bindings, tokens, indexed constructor metadata, and singleton/transient scopes.
- Built-in Service, Controller, and Provider kinds and decorators implemented through the generic managed-class extension APIs.
- Instantiated Application/kernel lifecycle with Provider registries, explicit registration precedence, manual context, and isolated invocation scopes.
- Generic managed-method kinds, canonical class-kind identity, strictly validated prebuilt parameter plans, custom resolver IDs, middleware, caller validation, and platform-independent invocation.
- Class-based primary-host adapters with guarded compiler/runtime contributions, prepared/manual host context, adapter-owned Providers, validation hooks, runtime registry consumers, native callbacks, and fake-adapter end-to-end proof.
- All test definitions, clean-install automation, and fixtures centralized beneath `tests/`.

## Current Work

- None. Milestones 0–6 are complete and all required gates pass.

## Next

- Milestone 7 — `bunwire.config.*` and Vite Source Discovery (not started).

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
