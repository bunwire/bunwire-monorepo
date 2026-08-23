# Compiler fixtures

Compiler milestones place isolated TypeScript fixture projects here. Keeping the fixture root in the repository foundation avoids coupling compiler tests to package internals.

`milestone-7-discovery` is the first realistic compiler fixture. It contains a bounded Bunwire source root, an adjacent ignored file, declarative config variants, exported and decoy bootstrap variants, and a runtime-loadable fake adapter module whose counters prove compiler discovery does not construct the adapter or invoke its native callback.

`milestone-8-analysis` is shared by Milestones 8 and 9. It contains aliased, re-exported, and cross-file canonical symbols; same-ID counterfeit decorators; valid and invalid explicit tokens; inherited-constructor and dependency-cycle cases; generic fake adapter extensions; interleaved method parameters; optional/rest caller parameters; invalid method placement and runtime-incompatible method shapes; and conflicting parameter-source decorators.

`milestone-10-registry` is the platform-independent generated-runtime fixture. It contains a Service, constructor-injected Controller, generated Provider, fake adapter-managed class and methods, interleaved caller/container/resolver sources, and a deliberately missing runtime token.

`milestone-12-electrobun` is the generated-client and full-application fixture. Its normal and manual bootstraps share compiler-discovered Services, a Controller, a Provider, explicit token binding, all Electrobun injectors, `@Use()` middleware, request/message methods, optional/defaulted/rest/array caller shapes, semantic caller contracts, and a real Electrobun frontend SDK compatibility source.
