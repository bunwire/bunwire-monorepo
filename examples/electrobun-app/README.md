# Bunwire Electrobun example

This package is the Milestone 12 end-to-end example. `src/bun/bootstrap.ts` defines the unstarted Application and declarative `ElectrobunAdapter`; `src/bun/main.ts` attaches the compiler-generated registry and calls the single `start()` boundary.

`src/bun/application.ts` demonstrates generated Providers, explicit token binding, Service and Controller constructor DI, managed-method auto-DI, `@Inject()`, `@Window()`, `@Context()`, `@Use()` middleware, requests, and messages. No decorated application class is manually instantiated.

`src/web/client.ts` exposes the typed client and Electrobun schema generated in `.bunwire/client.ts`. Callers pass logical positional arguments. The adapter's native single-payload encoding is not part of the example API.

Run `pnpm generate` after changing managed source. `pnpm build` regenerates both `.bunwire/registry.ts` and `.bunwire/client.ts` before compiling the package.
