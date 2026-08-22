# Compiler fixtures

Compiler milestones place isolated TypeScript fixture projects here. Keeping the fixture root in the repository foundation avoids coupling compiler tests to package internals.

`milestone-7-discovery` is the first realistic compiler fixture. It contains a bounded Bunwire source root, an adjacent ignored file, declarative config variants, exported and decoy bootstrap variants, and a runtime-loadable fake adapter module whose counters prove compiler discovery does not construct the adapter or invoke its native callback.
