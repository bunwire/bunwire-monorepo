# `@bunwire/bun` Additive Milestones v2

## Purpose and status

This is the follow-on implementation plan for features owned by `@bunwire/bun` after [Milestones 1–16](MILESTONES.md). Numbering continues at Milestone 17 so package progress records remain unambiguous. This document is a plan, not a claim that any v2 milestone has started or been completed.

Implement these milestones in order unless a later item supplies infrastructure strictly required by the current one. When work on a milestone starts, create its dedicated `progress/milestone-XX.md` and update `progress.md` and the project-level `docs/progress.md`. Apply the completion and impact-based testing rules in the repository instructions. The original milestone file remains the record of the completed first package plan.

The goals are to improve the existing HTTP, authorization, command, page, and WebSocket systems while preserving the package foundation and public contracts established by Milestones 1–16.

## Architectural rules for every v2 milestone

- Keep Core platform-independent. Bun-owned HTTP, command, page, and WebSocket behavior stays in this package; generally useful validation rules belong to `@bunwire/validation`.
- Use the established class-based `BunAdapter`, Core Application lifecycle, DI, managed invocation, generated registries, and compiler identities. No runtime decorator discovery or parallel application lifecycle.
- Preserve existing public behavior unless a milestone explicitly specifies a compatible extension. Review any changed wire format or persisted data format for versioning and migration before implementation.
- Keep optional infrastructure behind public contracts. The Bun-facing rate-limit contract belongs here; Redis and other backend implementations belong in separately planned optional packages.
- Maintain request, command, page, and WebSocket scope isolation. Never put invocation-local values in application scope or assume HTTP context propagates into a job or event.
- Each milestone must deliver usable behavior, documentation, relevant automated tests, and dependent-package checks before it is marked complete. Run directly affected tests first and expand only where shared behavior warrants it.
- Do not begin mail, notifications, localization, storage, OAuth/OIDC provider presets, durable session or queue drivers, or distributed schedule-lock implementations under this plan. Their ownership and contracts need separate plans.

---

# Milestone 17 — Authorization Conveniences

## Goal

Make existing abilities and named policies easier to use consistently in Controllers, Form Requests, services, middleware, and page rendering without changing their authorization semantics.

## Scope

Typed, request-aware convenience methods around the existing authorization manager; ergonomic policy checks; consistent denial behavior and documentation.

## Requirements

- Build on the existing `AuthorizationManager`, configured abilities/policies, `BunHttpContext`, and generated `can` middleware. Do not create a second policy registry or an ORM/model convention.
- Offer a direct `allows`/`denies` style check and an assertion that uses the established authorization exception path. Keep the current authorization API available.
- Allow a caller to evaluate a configured global ability or named policy against an explicit resource. Middleware may continue resolving named route parameters through its existing generated attachment.
- Preserve application-defined principal types and guard selection. Anonymous principals and missing policies/abilities must produce deterministic results or useful errors rather than silently granting access.
- Document how to reuse the same check in a Controller, Form Request `authorize()`, and page prop construction. Do not generate browser-visible authorization state implicitly.

## Tests

- **Unit/behavioral:** allow, deny, anonymous principal, missing name, direct assertion, and policy resource checks.
- **Integration:** direct checks, `can` middleware, and Form Request authorization agree for the same principal/resource; denial flows through the existing exception pipeline.
- **Type-level:** generic principal and resource types remain usable without a Bunwire model base class.

## Acceptance criteria

- Applications can express common authorization checks without duplicating policy lookup or denial handling.
- Existing configured abilities, policies, middleware, and Form Request behavior remain compatible.
- No new Core concept or runtime policy scan is required.

---

# Milestone 18 — HTTP Input and Response Conveniences

## Goal

Add signed URLs, pagination helpers, and common file/HTTP validation rules as cohesive conveniences over the existing Bun HTTP and validation foundations.

## Scope

Signing and verification for application URLs; parsing and rendering pagination state; additional validation rules for HTTP input and uploaded files.

## Requirements

### Signed URLs

- Provide a Bun HTTP signing service and verification middleware/helper using a configured secret, a canonical URL representation, a cryptographic signature, and optional expiration.
- Bind the intended HTTP method, path, and relevant query parameters into verification so tampering fails. Define deterministic duplicate-query and encoding behavior; do not sign raw header or proxy data implicitly.
- Reject malformed, modified, and expired signatures through the established HTTP exception path. Compare signatures safely and document key rotation or secret replacement behavior.
- Allow absolute or relative links only through explicit options; do not derive a trusted host from arbitrary request headers.

### Pagination

- Provide bounded parsing of page number/page size from HTTP input and a small result helper for items plus total/count metadata and navigation links.
- Preserve existing query filters in generated links while replacing pagination parameters. Reject or normalize malformed and excessive values according to documented configuration.
- Keep pagination persistence-agnostic: applications supply their own query and count operations. Do not introduce an ORM or database abstraction.

### Validation

- Add generally useful pure rules to `@bunwire/validation`; add Bun-specific upload/HTTP rules through the existing `FormRequest` integration.
- Validate file size, media type, and presence from actual parsed input. Treat client-supplied filenames and media types as untrusted; avoid promising content inspection without an explicit inspector.
- Keep rule failures on the existing 422 or page-validation redirect path and preserve preparation/authorization order.

## Tests

- **Unit/behavioral:** signed URL round-trip, tampering, expiration, encoding and duplicate-query cases; pagination bounds and link preservation; each validation rule's pass/fail cases.
- **Integration:** signed route authorization; Form Request file errors in JSON and page flows; pagination through a generated HTTP route.
- **Security:** host/header trust, signature comparison, malformed input, and file metadata assumptions.
- **Regression:** existing response resolver, exception, `FormRequest`, and `@bunwire/validation` suites affected by shared changes.

## Acceptance criteria

- Signed URLs cannot be changed or replayed after expiry without failing verification.
- Pagination works with any application persistence layer.
- Validation additions compose with the current engine and preserve HTTP/page failure behavior.

---

# Milestone 19 — Operational HTTP Features

## Goal

Give Bun applications predictable health reporting and maintenance behavior through their existing HTTP lifecycle.

## Scope

Liveness/readiness endpoints, application-supplied readiness checks, and a controlled maintenance response mode.

## Requirements

- Expose opt-in health routes through Bun HTTP configuration. Liveness reports a running host process; readiness reports whether configured dependencies are usable. Do not expose credentials, stack traces, or detailed dependency data publicly by default.
- Support async application readiness checks with bounded execution and deterministic failure reporting. The endpoint must not itself trigger application startup or run arbitrary Provider registration again.
- Add opt-in maintenance mode that stops normal HTTP requests with a documented status and optional retry information while retaining health access. Define explicit bypass rules for authorized operators; do not infer bypass from untrusted headers.
- Keep HTTP-specific behavior in `@bunwire/bun`; worker, scheduler, and command roles must not start HTTP merely because these options are configured.
- Ensure shutdown changes readiness before the server stops accepting work, using the existing Core/adapter lifecycle.

## Tests

- **Behavioral/integration:** healthy, failed, timed-out, and throwing readiness checks; maintenance enable/disable and bypass; health during maintenance and shutdown.
- **Security:** safe public response, bypass denial, and no leakage of dependency errors.
- **Role regression:** worker, scheduler, and command startup remain HTTP-free.

## Acceptance criteria

- Operators can distinguish process liveness from application readiness.
- Maintenance blocks ordinary HTTP work predictably while health and explicit operator access remain available.
- Neither feature creates another lifecycle or host server.

---

# Milestone 20 — Rate Limiting Foundation

## Goal

Provide a Bun HTTP rate-limiting policy and backend contract that can later be implemented by Redis without changing application-facing behavior.

## Scope

Configurable request limits, identity keys, response behavior, a process-local development/test backend, and a public storage/atomic-consumption contract.

## Requirements

- Integrate rate limiting through the existing Core/Bun middleware policy and HTTP context. Permit named policies for routes or middleware attachments; do not special-case Controllers in Core or Vite.
- Define an async backend operation that atomically consumes quota for a key/window and returns the decision plus reset information. The contract must state clock, concurrency, expiration, and failure expectations needed for a distributed implementation.
- Supply a process-local backend for development/tests. Document that it cannot enforce limits across processes.
- Make key selection explicit and request-aware (for example authenticated principal or a deliberately configured client-address policy). Do not trust proxy forwarding headers without a declared trust policy.
- Return a consistent HTTP limit failure with documented retry information. Define whether backend failures fail open or closed through explicit configuration; do not silently choose based on exception type.
- Keep Redis client code and connection configuration out of `@bunwire/bun`.

## Tests

- **Unit/behavioral:** quota boundary, reset, concurrent consumption, distinct identities, malformed policy configuration, and backend failure policy.
- **Integration:** generated route/middleware attachment, authenticated and anonymous keys, response status/headers, and request isolation.
- **Contract:** a fake backend implementing the public interface behaves the same as the process-local backend for the documented decision semantics.
- **Architecture:** no Redis dependency in `@bunwire/bun` or Core.

## Acceptance criteria

- Bun applications can rate-limit requests in one process now.
- An optional Redis package can implement the published backend contract without changing Bun middleware or application code.

---

# Milestone 21 — Command UX

## Goal

Improve the day-to-day usability of generated Bunwire commands while retaining deterministic, noninteractive execution.

## Scope

Help, display formatting, interactive input through command I/O, and clearer usage errors.

## Requirements

- Keep compiler-discovered `@Command()` classes, generated parameter resolvers, reserved built-ins, `runBunCli()`, and its exit-code contract authoritative.
- Improve per-command and global help from generated registry and parameter metadata; show required inputs, types, defaults, choices, aliases, and examples where declared.
- Add display helpers for tables, progress, and status messages through `BunCommandIO`, with output that remains testable and suitable for non-TTY environments.
- Offer optional prompts only when an application command explicitly requests interaction. In non-TTY/CI execution, fail with a useful usage error or use an explicitly supplied noninteractive value; never hang waiting for stdin.
- Preserve `--` handling, existing argument/option/flag parsing, one-shot lifecycle, and error/cleanup exit behavior.

## Tests

- **Generated output/behavioral:** help reflects compiled command metadata, including choices/defaults and invalid input.
- **Integration:** fake I/O captures output and prompt interaction; non-TTY invocation terminates deterministically; cleanup and exit codes remain correct.
- **Regression:** existing built-in commands and parser tests.

## Acceptance criteria

- Users can discover and run commands without inspecting source code.
- Scripts retain stable noninteractive behavior and exit codes.

---

# Milestone 22 — Advanced Page Protocol Features

## Goal

Extend server-driven pages without breaking the current initial HTML, navigation JSON, and production version-mismatch behavior.

## Scope

Partial reloads, deferred props, and server rendering as independently opt-in page features.

## Requirements

- Define an explicit protocol revision or negotiated capability for any new page request/response shape. Existing clients must continue to receive valid version-1 full page responses.
- Partial reloads may request selected props for the current component, but server-side authorization and shared-prop rules still run. Prevent omitted props from being mistaken for authoritative empty values on the client.
- Deferred props must evaluate in the relevant request scope, have defined error and cancellation behavior, and never retain `BunHttpContext` or session state after disposal. Browser updates must target the correct navigation and not overwrite a newer page.
- Add optional SSR through the existing `@bunwire/vite` page manifest and renderer boundary. Keep browser and server bundles separate, escape embedded state, and preserve a client-only mode.
- Keep the framework-neutral client and React renderer contracts aligned; do not require React in the Bun server package's baseline runtime.
- Preserve validation redirect, flash/old-input consumption, shared-prop precedence, HMR, and production asset-version reload behavior.

## Tests

- **Protocol/contract:** old client/full response compatibility, partial and deferred response shapes, stale navigation/version conflicts.
- **Integration/E2E:** partial navigation, deferred completion/error/cancellation, SSR initial load and hydration, validation flash, development HMR, and production manifest resolution.
- **Security/regression:** serialized state escaping, authorization on selected props, request-scope disposal, and existing page tests.

## Acceptance criteria

- Applications can opt into partial props, deferred props, or SSR independently.
- The existing page helper and version-1 client behavior remain usable.
- New async page work does not leak request-local state or race newer navigation.

---

# Milestone 23 — WebSocket Conveniences

## Goal

Make common connection and message patterns easier while retaining Bun's native socket and Bunwire's generated handler/scope model.

## Scope

Typed message envelopes, targeted send/broadcast helpers, and channel authorization conveniences.

## Requirements

- Keep `@WebSocket()` handlers, compiler-generated routes and plans, native `ServerWebSocket`, upgrade middleware, identity snapshot, and connection/message scopes canonical.
- Offer opt-in message codecs or typed envelopes with explicit validation and a documented malformed-message close/error policy. Do not infer message types by runtime class names.
- Add helpers for sending to one connection or an authorized channel, built on native Bun publish/subscribe behavior. Define delivery and backpressure expectations; do not promise persistence or exactly-once delivery.
- Authorize channel joins using durable connection identity and application-supplied policy. Do not resurrect the disposed upgrade request or share mutable connection-local state across clients.
- Keep long-lived connection data bounded and cleanup deterministic on close, failed upgrade, and `app.stop()`.

## Tests

- **Unit/behavioral:** envelope validation, unauthorized subscription, send/broadcast behavior, and backpressure outcomes.
- **Real Bun integration:** multiple clients, per-connection isolation, channel authorization, disconnect, malformed input, and shutdown.
- **Regression:** existing upgrade middleware, identity, connection/message scope, and native socket tests.

## Acceptance criteria

- Common typed messaging and channel patterns require less application glue.
- Native Bun WebSocket capabilities and current Bunwire handler behavior remain available.
- Connection identity and scope boundaries hold across multiple clients and shutdown.

---

# Milestone 24 — Cross-Feature Hardening and v2 Compatibility

## Goal

Verify the additive features work together and leave a documented, stable Bun package surface.

## Scope

Integrated application flows, security and resource review, public API/protocol review, examples, and completion records.

## Requirements

- Exercise representative combined flows: signed route with auth and rate limiting; Form Request file validation with page errors; authorization within partial/deferred pages; health and maintenance during shutdown; commands inspecting the generated application; authorized WebSocket channels with multiple clients.
- Review external input trust, secrets, signed URL canonicalization, rate-limit identity, error disclosure, page serialization, prompt behavior, and WebSocket message validation.
- Review public exports and package boundaries; version any changed page wire format and document compatibility. Do not silently alter queue envelopes, session persistence, or generated registry schemas for unrelated conveniences.
- Update Bun package guide, examples, and architecture documentation for every shipped feature. Record intentionally deferred optional backend packages and unresolved limitations.
- Complete all v2 milestone progress files and update both package and project-level progress indexes only when their documented completion criteria hold.

## Tests

- **Integration/E2E:** combined flows above through the real Bun adapter where host behavior matters.
- **Architecture/build:** package boundary, typecheck, build, export and clean-install checks for changed package surfaces.
- **Regression:** all directly affected package and dependent-module suites; run the broader Bun suite at this final verification checkpoint and the repository-wide suite if shared infrastructure or contracts changed broadly.
- **Behavioral:** run the documented example flows, including shutdown and noninteractive command use.

## Acceptance criteria

- Every v2 feature is documented, tested, integrated, and represented accurately in its milestone progress record.
- No known regression or package-boundary violation remains concealed.
- Applications can adopt the new conveniences without rebuilding their existing Bunwire bootstrap or replacing first-plan APIs.

---

# Work Outside This Plan

The original [additive feature list](MILESTONES.md#features-intentionally-left-additive-after-these-milestones) remains a backlog, not an automatic package assignment. Plan optional OAuth/OIDC provider presets, durable session and queue stores, Redis rate-limit storage, distributed scheduler locks, mail transports, notifications, broadcasting products, localization, and storage/S3 integrations separately. Broad broadcasting may reuse Milestone 23's socket helpers, but product-level delivery semantics need their own design.

Do not extract jobs, schedules, or Bun execution scopes into Core merely because another backend is conceivable. Extract only a proven platform-neutral contract needed by a second host, with its own architecture decision and migration plan.
