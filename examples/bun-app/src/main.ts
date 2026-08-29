import applicationRegistry from "../.bunwire/registry.js";
import app from "./bootstrap.js";

await app.withRuntimeRegistry(applicationRegistry).start();

// Milestone 1 has no long-running feature subsystem yet. The explicit stop
// demonstrates Core-owned cleanup and keeps this foundation example runnable.
await app.stop();
