# `@bunwire/bun` Implementation Progress

## Current Status

Current milestone: None — Milestone 4 is complete

Overall status:

- Milestone 1: Complete — [details](progress/milestone-01.md)
- Milestone 2: Complete — [details](progress/milestone-02.md)
- Milestone 3: Complete — [details](progress/milestone-03.md)
- Milestone 4: Complete — [details](progress/milestone-04.md)
- Milestones 5–16: Not started

## Implemented

- Public `@bunwire/bun` package at version `0.1.1` with `BunAdapter`, explicit runtime roles, generated-registry consumption, and automatic signal cleanup.
- Core-owned terminal `Application.stop()` lifecycle, adapter cleanup, and startup rollback.
- Minimal generated-registry Bun example and real Bun-process lifecycle coverage.
- Workspace build, boundary, export, package, clean-install, and release checks include the Bun package.
- Public child-container execution scopes with contextual bindings, per-scope services, WebSocket hierarchy, deterministic disposal, and graceful shutdown coordination.
- Core Controller-based HTTP decorators, compiler-validated generated routes, explicit frozen request context, isolated request scopes, and native `Bun.serve()` lifecycle.
- Generated Core middleware execution for Bun HTTP with immutable native context, actual-path/method filters, DI, ordered policy, parameterized attachments, short-circuiting, and request isolation.

## Current Work

- No Bun package milestone is currently in progress.

## Next

- Milestone 5 — Response Resolution and Exception Pipeline

## Blockers

- None.

## Milestone Progress Files

- [Milestone 1](progress/milestone-01.md)
- [Milestone 2](progress/milestone-02.md)
- [Milestone 3](progress/milestone-03.md)
- [Milestone 4](progress/milestone-04.md)
