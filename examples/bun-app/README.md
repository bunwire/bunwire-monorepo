# Bunwire Bun HTTP example

This example demonstrates the Bun composition and native HTTP boundary:

- `bootstrap.ts` configures and exports Core's Application with `BunAdapter`;
- Bunwire's compiler generates the runtime registry without executing the bootstrap;
- a Core `@Controller()` uses Bun `@Get`, `@Post`, and explicit `@Context()`;
- canonical Core middleware is configured through a parameterized group, filters native HTTP paths/methods, adds response headers, and short-circuits one route;
- `main.ts` loads that registry and starts once, with shutdown owned by Core and `BunAdapter` signal handling.

The server listens with Bun's native router. Try `GET /api`, `POST /api/echo/:id`, or `GET /api/blocked`. Result normalization and replaceable exception rendering remain later milestones.

```sh
pnpm --filter @bunwire/example-bun-app build
bun examples/bun-app/dist/src/main.js
```
