# Compiler fixtures

Compiler milestones place isolated TypeScript fixture projects here. Keeping the fixture root in the repository foundation avoids coupling compiler tests to package internals.

`milestone-7-discovery` is the first realistic compiler fixture. It contains a bounded Bunwire source root, an adjacent ignored file, declarative config variants, exported and decoy bootstrap variants, and a runtime-loadable fake adapter module whose counters prove compiler discovery does not construct the adapter or invoke its native callback.

`milestone-8-analysis` is shared by Milestones 8 and 9. It contains aliased/cross-file managed symbols, explicit token and class injection, same-named unrelated decorators, plain/interface constructor failures, generic fake adapter class/method/injector extensions, interleaved method parameters, optional/rest caller parameters, invalid method placement, and conflicting parameter-source decorators.
