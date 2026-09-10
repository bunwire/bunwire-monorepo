# `@bunwire/bun` Implementation Progress

## Current Status

Current milestone: Milestone 14 — Commands and Bunwire CLI Runtime (complete).

Overall status:

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
- Milestone 13: Complete — [details](progress/milestone-13.md)
- Milestone 14: Complete — [details](progress/milestone-14.md)
- Milestones 15–16: Not started

## Implemented

- Public `@bunwire/bun` package at version `0.1.1` with `BunAdapter`, explicit runtime roles, generated-registry consumption, and automatic signal cleanup.
- Core-owned terminal `Application.stop()` lifecycle, adapter cleanup, and startup rollback.
- Minimal generated-registry Bun example and real Bun-process lifecycle coverage.
- Workspace build, boundary, export, package, clean-install, and release checks include the Bun package.
- Public child-container execution scopes with contextual bindings, per-scope services, WebSocket hierarchy, deterministic disposal, and graceful shutdown coordination.
- Core Controller-based HTTP decorators, compiler-validated generated routes, explicit frozen request context, isolated request scopes, and native `Bun.serve()` lifecycle.
- Generated Core middleware execution for Bun HTTP with immutable native context, actual-path/method filters, DI, ordered policy, parameterized attachments, short-circuiting, and request isolation.
- Centralized native/JSON/void/redirect response resolution, ordered extension resolvers, deterministic HTTP exceptions, and replaceable reporting/rendering.
- Canonical registered Form Requests with constructor DI, deterministic HTTP input aggregation, preparation, authorization, async validation, exact compiler identities, and request isolation.
- Signed server-side sessions, native cookie integration, one-request flash/old input, same-session serialization, and generated CSRF middleware.
- Generic session/bearer authentication, standards-backed OAuth 2.0 Authorization Code + PKCE, explicit abilities and policies, and generated `auth`, `guest`, and `can` middleware.
- Versioned server-driven pages, framework-neutral browser navigation, a React renderer, generated Vite page manifests, development HMR, exact production assets, and page-aware validation flash.
- Verified Core event/listener integration: generated identities and DI, sequential direct dispatch, explicit invocation-local bindings, test replacement, and an awaited HTTP-to-event example.
- Canonical generated jobs, transient constructor DI, typed explicit dispatch, strict/versioned serialization, sync execution, memory queue leases, and lifecycle-coordinated queue cleanup.
- Automatic workers, cooperative timeouts, retries/backoff, renewable leases, failed-job management and queued Core listeners with typed codecs, generic compiler attachments, runnable examples and graceful shutdown.
- Compiler-backed direct and central schedules, five-field cron/timezone semantics, isolated scheduled-task scopes, scheduled job dispatch, renewable lock-provider contracts, and graceful scheduler-role shutdown.
- Compiler-discovered managed commands, generated arguments/options/flags, isolated command scopes, deterministic CLI lifecycle/exit behavior, generated-registry introspection, and on-demand HTTP/worker/schedule operations.

## Current Work

- Milestone 14 is complete; no Bun package milestone is currently in progress.

## Next

- Milestone 15 — Bun WebSockets.

## Blockers

- None.

## Milestone Progress Files

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
- [Milestone 13](progress/milestone-13.md)
- [Milestone 14](progress/milestone-14.md)
