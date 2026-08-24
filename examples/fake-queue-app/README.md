# Fake queue adapter example

This private workspace example proves Bunwire's adapter boundary without relying on Electrobun. It defines its own `@Consumer()` outer decorator, `@Command()` and `@Event()` managed method decorators, `@Delivery()` parameter injector, compiler descriptor, runtime registry consumer, host context, and adapter-owned middleware filtering.

The Milestone 12F/13 integration test compiles the example's application into a runtime registry and executes commands and events through `FakeQueueAdapter`. Neither Core nor the generic Vite/compiler package contains fake-queue branches.

Run `pnpm --filter @bunwire/fake-queue build` to typecheck and build the example.
