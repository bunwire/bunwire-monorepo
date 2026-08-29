# Bunwire Bun foundation example

This example demonstrates the Milestone 1 composition boundary:

- `bootstrap.ts` configures and exports Core's Application with `BunAdapter`;
- Bunwire's compiler generates the runtime registry without executing the bootstrap;
- `main.ts` loads that registry, starts once, and stops through Core's lifecycle.

No HTTP server or later Bun subsystem is expected in Milestone 1.

```sh
pnpm --filter @bunwire/example-bun-app build
bun examples/bun-app/dist/src/main.js
```
