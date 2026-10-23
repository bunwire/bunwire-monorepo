# Milestone 23 — WebSocket Conveniences

Status: Complete

## Packages Changed

- `packages/bun`

## Implemented

- Added explicit typed JSON envelope codecs with payload validation and a distinct malformed-message close code.
- Added connection-scoped channel helpers, durable-identity join policy, native delivery status mapping, bounded subscriptions, and cleanup.
- Exported the new API and documented behavior in the Bun package and architecture guides.

## Remaining

- None.

## Acceptance Criteria

- [x] Typed messages and authorized channels require less application glue.
- [x] Native socket and current generated handler behavior remain available.
- [x] Identity and scope isolation hold through disconnect and shutdown.

## Tests Added

- `tests/bun/milestone-23/websocket-conveniences.test.ts` — codec, authorization, delivery, backpressure, and cleanup.
- `tests/bun/milestone-23/websocket-process.test.ts` — real Bun multi-client authorization, direct send, malformed input, disconnect, and shutdown.

## Tests Run

- Focused Milestone 23 unit and real Bun process tests.
- Bun package and test-file TypeScript checks; Bun package build; package boundary check.
- Milestone 15 WebSocket unit, compiler, and real Bun process tests; built-export audit.

## Test Results

- Milestone 23 unit: 10 passed; real Bun process: 1 passed.
- Milestone 15 WebSocket identity and compiler tests: 17 passed; real Bun process: 1 passed when run alone. Its first run timed out under concurrent heavy checks, then passed in 23.23 seconds on isolated rerun.
- `pnpm --filter @bunwire/bun typecheck`: passed.
- `pnpm exec tsc -p tsconfig.tests.json --noEmit --pretty false`: passed.
- `pnpm --filter @bunwire/bun build`: passed.
- `pnpm check:boundaries`: passed.
- `pnpm test:built-exports`: passed after updating the public export allowlist.

## Regression Checks

- Existing upgrade middleware, identity snapshot, connection/message scopes, native publish, and shutdown flows passed in the Milestone 15 regression suite.

## Expected Behavior

- Handlers may opt into validated text envelopes and authorized helper-managed channels while retaining native sockets.
- Malformed opted-in messages close with `1007`; ordinary raw handlers keep their existing behavior.

## Not Expected Yet

- Durable or exactly-once messaging, replay, automatic retry, or cross-server channel delivery.

## Important Decisions

- Typed decoding is opt-in in handlers; denied channel joins leave the socket open.
- Channel authorization uses only the durable identity snapshot and connection metadata.
- Helper-managed subscriptions are capped at 32 per connection by default; direct native subscriptions remain an application escape hatch.

## Known Limitations

- Native publish and send outcomes report Bun's immediate result, not recipient acknowledgement.

## Blockers

- None.

## Completion

- All Milestone 23 acceptance criteria, required tests, relevant regressions, build, type, export, and package-boundary checks are satisfied.
