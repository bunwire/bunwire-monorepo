# `@bunwire/bun` Implementation Progress

## Current Status

Current milestone: Milestone 24 — cross-feature hardening (complete).

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
- Milestone 15: Complete — [details](progress/milestone-15.md)
- Milestone 16: Complete — [details](progress/milestone-16.md)
- Milestone 17: Complete — [details](progress/milestone-17.md)
- Milestone 18: Complete — [details](progress/milestone-18.md)
- Milestone 19: Complete — [details](progress/milestone-19.md)
- Milestone 20: Complete — [details](progress/milestone-20.md)
- Milestone 21: Complete — [details](progress/milestone-21.md)
- Milestone 22: Complete — [details](progress/milestone-22.md)
- Milestone 23: Complete — [details](progress/milestone-23.md)
- Milestone 24: Complete — [details](progress/milestone-24.md)

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
- Form Request aggregation preserves literal special field names and repeated query/form values.
- Signed server-side sessions, native cookie integration, one-request flash/old input, same-session serialization, and generated CSRF middleware.
- Generic session/bearer authentication, standards-backed OAuth 2.0 Authorization Code + PKCE, explicit abilities and policies, and generated `auth`, `guest`, and `can` middleware.
- Versioned server-driven pages, framework-neutral browser navigation, a React renderer, generated Vite page manifests, development HMR, exact production assets, and page-aware validation flash.
- Verified Core event/listener integration: generated identities and DI, sequential direct dispatch, explicit invocation-local bindings, test replacement, and an awaited HTTP-to-event example.
- Canonical generated jobs, transient constructor DI, typed explicit dispatch, strict/versioned serialization, sync execution, memory queue leases, and lifecycle-coordinated queue cleanup.
- Automatic workers, cooperative timeouts, retries/backoff, renewable leases, failed-job management and queued Core listeners with typed codecs, generic compiler attachments, runnable examples and graceful shutdown.
- Compiler-backed direct and central schedules, five-field cron/timezone semantics, isolated scheduled-task scopes, scheduled job dispatch, renewable lock-provider contracts, and graceful scheduler-role shutdown.
- Stepped cron day-of-month and weekday fields follow the documented OR semantics.
- Compiler-discovered managed commands, generated arguments/options/flags, isolated command scopes, deterministic CLI lifecycle/exit behavior, generated-registry introspection, and on-demand HTTP/worker/schedule operations.
- Compiler-generated Bun-native WebSocket routes, upgrade middleware/security, durable identity snapshots, connection/message scopes, DI lifecycle hooks, native messaging, and bounded shutdown.
- Integrated real Bun application flows, isolated testing utilities, structured observability, security review and hardening, performance sanity checks, documentation, and compatibility assertions for the initial package contract.
- Post-completion regressions fixed: special session keys persist across store normalization, and unresolved WebSocket handlers no longer hold shutdown past its grace period; details remain with Milestones 7 and 15.
- Milestone 17 adds request-scoped authorization allow/deny and named-policy helpers while preserving the existing manager and middleware behavior.
- Milestone 18 adds signed URLs with generated verification middleware, bounded pagination, and shared native `File` validation rules.
- Milestone 19 adds opt-in native health endpoints and runtime maintenance control with explicit operator bypass.
- Milestone 20 adds named fixed-window rate limit policies, an atomic backend contract, and built-in HTTP middleware.
- Milestone 21 adds generated command help details, deterministic display helpers, and explicit nonblocking prompts.
- Milestone 22 adds negotiated partial/deferred page responses and an optional separate SSR renderer bundle, with focused page, Vite, build, export, and release checks passing.
- Milestone 23 adds opt-in validated WebSocket envelopes, identity-authorized channel joins, targeted send/broadcast helpers, bounded subscriptions, and deterministic cleanup.
- Milestone 24 verifies the v2 features together in a real Bun example, reviews their security and compatibility boundaries, and corrects an outgoing WebSocket codec edge case. The broad Bun checkpoint had two failures that passed after a focused fixture update and isolated rerun; see its record.
- Post-completion review fixes for Milestones 19 and 22 prevent overlapping readiness checks and out-of-order async page renders; their milestone records contain the focused verification.

## Current Work

- No Bun v2 milestone is in progress.

## Next

- Plan optional backend packages separately from the completed v2 integration milestones.

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
- [Milestone 15](progress/milestone-15.md)
- [Milestone 16](progress/milestone-16.md)
- [Milestone 17](progress/milestone-17.md)
- [Milestone 18](progress/milestone-18.md)
- [Milestone 19](progress/milestone-19.md)
- [Milestone 20](progress/milestone-20.md)
- [Milestone 21](progress/milestone-21.md)
- [Milestone 22](progress/milestone-22.md)
- [Milestone 23](progress/milestone-23.md)
- [Milestone 24](progress/milestone-24.md)
